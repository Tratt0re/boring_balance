const fs = require('node:fs');
const path = require('node:path');
const { getDatabase, selectRows } = require('../database');
const accountsModel = require('./accounts.model');
const categoriesModel = require('./categories.model');
const { transactionsModel, transfersModel } = require('./transactions');
const { TRANSFER_CATEGORY_ID } = require('./transactions/constants');
const { parseDdMmYyyyToUnixMilliseconds } = require('../utils/date-parse');
const {
  findWorksheetByAliases,
  mapWorksheetRows,
  normalizeLookupKey,
  readWorkbookFromFile,
  readWorksheetHeaderMap,
} = require('../utils/excel-utils');
const { parseDecimalToCents } = require('../utils/money-parse');
const {
  containsControlCharacters,
  normalizeTrimmedString,
  normalizeWhitespace,
  startsWithFormulaPrefix,
  toCaseInsensitiveLookupKey,
} = require('../utils/string-sanitize');

const XLSX_EXTENSION = '.xlsx';
const ACCOUNT_TYPES = new Set(['cash', 'bank', 'savings', 'brokerage', 'crypto', 'credit']);
const CATEGORY_TYPES = new Set(['expense', 'income', 'exclude']);
const NAME_MAX_LENGTH = 80;
const DESCRIPTION_MAX_LENGTH = 500;
const SHEET_ORDER = Object.freeze({
  workbook: 0,
  accounts: 1,
  categories: 2,
  transactions: 3,
  transfers: 4,
});
const SHEET_DEFINITIONS = Object.freeze({
  accounts: Object.freeze({
    aliases: ['accounts', 'account'],
    requiredColumns: ['name', 'type'],
    optionalColumns: ['description', 'archived'],
    headerAliases: Object.freeze({
      name: ['name', 'account'],
      type: ['type'],
      description: ['description'],
      archived: ['archived'],
    }),
  }),
  categories: Object.freeze({
    aliases: ['categories', 'category'],
    requiredColumns: ['name', 'type'],
    optionalColumns: ['description', 'archived'],
    headerAliases: Object.freeze({
      name: ['name', 'category'],
      type: ['type'],
      description: ['description'],
      archived: ['archived'],
    }),
  }),
  transactions: Object.freeze({
    aliases: ['transactions', 'transaction'],
    requiredColumns: ['date', 'amount', 'category', 'account'],
    optionalColumns: ['description', 'settled', 'category_type'],
    headerAliases: Object.freeze({
      date: ['date'],
      amount: ['amount'],
      category: ['category'],
      account: ['account'],
      description: ['description'],
      settled: ['settled'],
      category_type: ['category_type', 'category type'],
    }),
  }),
  transfers: Object.freeze({
    aliases: ['transfers', 'transfer'],
    requiredColumns: ['date', 'amount', 'sender_account', 'receiver_account'],
    optionalColumns: ['description', 'settled'],
    headerAliases: Object.freeze({
      date: ['date'],
      amount: ['amount'],
      sender_account: ['sender_account', 'sender account', 'from_account', 'from account'],
      receiver_account: ['receiver_account', 'receiver account', 'to_account', 'to account'],
      description: ['description'],
      settled: ['settled'],
    }),
  }),
});

function ensureDatabase(database) {
  if (!database || typeof database.prepare !== 'function' || typeof database.transaction !== 'function') {
    throw new Error('database must be an initialized better-sqlite3 Database instance.');
  }

  return database;
}

function createImportError(sheet, row, column, code, message) {
  return {
    sheet,
    row,
    ...(column ? { column } : {}),
    code,
    message,
  };
}

function sortErrors(errors = []) {
  return [...errors].sort((left, right) => {
    const leftSheetOrder = SHEET_ORDER[left.sheet] ?? Number.MAX_SAFE_INTEGER;
    const rightSheetOrder = SHEET_ORDER[right.sheet] ?? Number.MAX_SAFE_INTEGER;
    if (leftSheetOrder !== rightSheetOrder) {
      return leftSheetOrder - rightSheetOrder;
    }

    if (left.row !== right.row) {
      return left.row - right.row;
    }

    const leftColumn = left.column ?? '';
    const rightColumn = right.column ?? '';
    if (leftColumn !== rightColumn) {
      return leftColumn.localeCompare(rightColumn);
    }

    return left.code.localeCompare(right.code);
  });
}

function ensureImportFilePath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error('filePath must be a non-empty string.');
  }

  const resolvedPath = path.resolve(filePath.trim());
  if (path.extname(resolvedPath).toLowerCase() !== XLSX_EXTENSION) {
    throw new Error('filePath must point to a .xlsx file.');
  }

  fs.accessSync(resolvedPath, fs.constants.R_OK);
  return resolvedPath;
}

function readSheetConfigEntries() {
  return Object.entries(SHEET_DEFINITIONS);
}

function resolveFieldColumns(headerMap, headerAliases) {
  const fieldColumns = {};

  for (const [fieldName, aliases] of Object.entries(headerAliases)) {
    const matchedHeader = aliases
      .map((alias) => headerMap.get(normalizeLookupKey(alias)))
      .find((entry) => entry !== undefined);

    fieldColumns[fieldName] = matchedHeader?.column;
  }

  return fieldColumns;
}

function resolveWorksheetStructure(workbook, sheetName, sheetDefinition, errors) {
  const matchingWorksheets = workbook.worksheets.filter((worksheet) =>
    sheetDefinition.aliases.some((alias) => normalizeLookupKey(alias) === normalizeLookupKey(worksheet.name)),
  );

  if (matchingWorksheets.length === 0) {
    errors.push(
      createImportError(
        sheetName,
        1,
        undefined,
        'SHEET_MISSING',
        `Missing required worksheet "${sheetName}".`,
      ),
    );
    return null;
  }

  if (matchingWorksheets.length > 1) {
    errors.push(
      createImportError(
        sheetName,
        1,
        undefined,
        'SHEET_DUPLICATED',
        `Multiple worksheets match "${sheetName}". Keep only one matching sheet.`,
      ),
    );
    return null;
  }

  const worksheet = findWorksheetByAliases(workbook, sheetDefinition.aliases);
  const headerMap = readWorksheetHeaderMap(worksheet);
  if (headerMap.size === 0) {
    errors.push(
      createImportError(
        sheetName,
        1,
        undefined,
        'HEADER_ROW_MISSING',
        `Worksheet "${sheetName}" is missing a header row.`,
      ),
    );
    return null;
  }

  const fieldColumns = resolveFieldColumns(headerMap, sheetDefinition.headerAliases);

  for (const columnName of sheetDefinition.requiredColumns) {
    if (Number.isInteger(fieldColumns[columnName]) && fieldColumns[columnName] > 0) {
      continue;
    }

    errors.push(
      createImportError(
        sheetName,
        1,
        columnName,
        'COLUMN_MISSING',
        `Worksheet "${sheetName}" is missing required column "${columnName}".`,
      ),
    );
  }

  return {
    worksheet,
    fieldColumns,
  };
}

function validateWorkbookStructure(workbook) {
  const errors = [];
  const sheets = {};

  for (const [sheetName, sheetDefinition] of readSheetConfigEntries()) {
    const structure = resolveWorksheetStructure(workbook, sheetName, sheetDefinition, errors);
    if (!structure) {
      continue;
    }

    sheets[sheetName] = structure;
  }

  return {
    ok: errors.length === 0,
    errors: sortErrors(errors),
    sheets,
  };
}

async function parseWorkbook(filePath) {
  const resolvedFilePath = ensureImportFilePath(filePath);
  const workbook = await readWorkbookFromFile(resolvedFilePath);
  const structureResult = validateWorkbookStructure(workbook);

  if (!structureResult.ok) {
    return {
      ok: false,
      errors: structureResult.errors,
      filePath: resolvedFilePath,
    };
  }

  const rows = {};
  for (const [sheetName, structure] of Object.entries(structureResult.sheets)) {
    rows[sheetName] = mapWorksheetRows(structure.worksheet, structure.fieldColumns);
  }

  return {
    ok: true,
    filePath: resolvedFilePath,
    workbook,
    rows,
  };
}

function getCellText(cellInfo) {
  return String(cellInfo?.text ?? '');
}

function normalizeSafeTextValue(value, options = {}) {
  const normalizedValue = options.collapseWhitespace ? normalizeWhitespace(value) : normalizeTrimmedString(value);

  if (containsControlCharacters(normalizedValue)) {
    throw new Error('must not contain control characters.');
  }

  if (startsWithFormulaPrefix(normalizedValue)) {
    throw new Error('must not start with =, +, -, or @.');
  }

  if (options.maxLength !== undefined && normalizedValue.length > options.maxLength) {
    throw new Error(`must be at most ${options.maxLength} characters.`);
  }

  return normalizedValue;
}

function parseTextField(rawRow, sheetName, fieldName, errors, options = {}) {
  const cellInfo = rawRow.values[fieldName];
  if (cellInfo?.isFormula) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'FORMULA_NOT_ALLOWED',
        `Formula cells are not allowed in "${fieldName}".`,
      ),
    );
    return null;
  }

  const cellText = getCellText(cellInfo);
  const trimmedValue = cellText.trim();

  if (trimmedValue.length === 0) {
    if (options.required) {
      errors.push(
        createImportError(
          sheetName,
          rawRow.rowNumber,
          fieldName,
          'REQUIRED',
          `"${fieldName}" is required.`,
        ),
      );
    }

    return null;
  }

  try {
    return normalizeSafeTextValue(cellText, options);
  } catch (error) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'INVALID_TEXT',
        `"${fieldName}" ${error.message}`,
      ),
    );
    return null;
  }
}

function parseEnumField(rawRow, sheetName, fieldName, allowedValues, errors) {
  const cellInfo = rawRow.values[fieldName];
  if (cellInfo?.isFormula) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'FORMULA_NOT_ALLOWED',
        `Formula cells are not allowed in "${fieldName}".`,
      ),
    );
    return null;
  }

  const cellText = getCellText(cellInfo);
  const trimmedValue = cellText.trim();

  if (trimmedValue.length === 0) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'REQUIRED',
        `"${fieldName}" is required.`,
      ),
    );
    return null;
  }

  if (containsControlCharacters(trimmedValue)) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'INVALID_TEXT',
        `"${fieldName}" must not contain control characters.`,
      ),
    );
    return null;
  }

  const normalizedValue = trimmedValue.toLocaleLowerCase();
  if (!allowedValues.has(normalizedValue)) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'INVALID_ENUM',
        `"${fieldName}" must be one of: ${Array.from(allowedValues).join(', ')}.`,
      ),
    );
    return null;
  }

  return normalizedValue;
}

function parseDateField(rawRow, sheetName, fieldName, errors) {
  const cellInfo = rawRow.values[fieldName];
  if (cellInfo?.isFormula) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'FORMULA_NOT_ALLOWED',
        `Formula cells are not allowed in "${fieldName}".`,
      ),
    );
    return null;
  }

  const cellText = getCellText(cellInfo);
  const trimmedValue = cellText.trim();

  if (trimmedValue.length === 0) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'REQUIRED',
        `"${fieldName}" is required.`,
      ),
    );
    return null;
  }

  if (containsControlCharacters(trimmedValue)) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'INVALID_TEXT',
        `"${fieldName}" must not contain control characters.`,
      ),
    );
    return null;
  }

  try {
    return parseDdMmYyyyToUnixMilliseconds(trimmedValue, `${sheetName}.${fieldName}`);
  } catch (error) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'INVALID_DATE',
        error.message,
      ),
    );
    return null;
  }
}

function parseAmountField(rawRow, sheetName, fieldName, errors, options = {}) {
  const cellInfo = rawRow.values[fieldName];
  if (cellInfo?.isFormula) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'FORMULA_NOT_ALLOWED',
        `Formula cells are not allowed in "${fieldName}".`,
      ),
    );
    return null;
  }

  const cellText = getCellText(cellInfo);
  const trimmedValue = cellText.trim();

  if (trimmedValue.length === 0) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'REQUIRED',
        `"${fieldName}" is required.`,
      ),
    );
    return null;
  }

  if (containsControlCharacters(trimmedValue)) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'INVALID_TEXT',
        `"${fieldName}" must not contain control characters.`,
      ),
    );
    return null;
  }

  try {
    return parseDecimalToCents(trimmedValue, `${sheetName}.${fieldName}`, options);
  } catch (error) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'INVALID_AMOUNT',
        error.message,
      ),
    );
    return null;
  }
}

function parseOptionalBooleanField(rawRow, sheetName, fieldName, errors, defaultValue) {
  const cellInfo = rawRow.values[fieldName];
  if (!cellInfo) {
    return defaultValue;
  }

  if (cellInfo.isFormula) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'FORMULA_NOT_ALLOWED',
        `Formula cells are not allowed in "${fieldName}".`,
      ),
    );
    return null;
  }

  if (typeof cellInfo.rawValue === 'boolean') {
    return cellInfo.rawValue ? 1 : 0;
  }

  if (cellInfo.rawValue === 1 || cellInfo.rawValue === 0) {
    return Number(cellInfo.rawValue);
  }

  const trimmedValue = getCellText(cellInfo).trim();
  if (trimmedValue.length === 0) {
    return defaultValue;
  }

  if (containsControlCharacters(trimmedValue)) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'INVALID_TEXT',
        `"${fieldName}" must not contain control characters.`,
      ),
    );
    return null;
  }

  const normalizedValue = trimmedValue.toLocaleLowerCase();
  if (normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes') {
    return 1;
  }

  if (normalizedValue === 'false' || normalizedValue === '0' || normalizedValue === 'no') {
    return 0;
  }

  errors.push(
    createImportError(
      sheetName,
      rawRow.rowNumber,
      fieldName,
      'INVALID_BOOLEAN',
      `"${fieldName}" must be TRUE/FALSE, YES/NO, or 1/0.`,
    ),
  );
  return null;
}

function parseStrictBoolean(value, defaultValue = false) {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
      return defaultValue;
    }

    const normalizedValue = trimmedValue.toLocaleLowerCase();
    if (normalizedValue === 'true') {
      return true;
    }

    if (normalizedValue === 'false') {
      return false;
    }
  }

  throw new Error('Invalid settled value. Only TRUE or FALSE are allowed.');
}

function parseStrictBooleanField(rawRow, sheetName, fieldName, errors, defaultValue = false) {
  const cellInfo = rawRow.values[fieldName];
  if (!cellInfo) {
    return defaultValue ? 1 : 0;
  }

  if (cellInfo.isFormula) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'FORMULA_NOT_ALLOWED',
        `Formula cells are not allowed in "${fieldName}".`,
      ),
    );
    return null;
  }

  const cellText = getCellText(cellInfo);
  if (containsControlCharacters(cellText)) {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'INVALID_BOOLEAN',
        'Invalid settled value. Only TRUE or FALSE are allowed.',
      ),
    );
    return null;
  }

  try {
    const normalizedValue = parseStrictBoolean(
      typeof cellInfo.rawValue === 'boolean' ? cellInfo.rawValue : cellText,
      defaultValue,
    );

    return normalizedValue ? 1 : 0;
  } catch {
    errors.push(
      createImportError(
        sheetName,
        rawRow.rowNumber,
        fieldName,
        'INVALID_BOOLEAN',
        'Invalid settled value. Only TRUE or FALSE are allowed.',
      ),
    );
    return null;
  }
}

function buildExistingEntityIndex(rows = []) {
  const byLookupKey = new Map();

  rows.forEach((row) => {
    if (typeof row?.name !== 'string' || row.name.trim().length === 0) {
      return;
    }

    const lookupKey = toCaseInsensitiveLookupKey(row.name);
    if (!byLookupKey.has(lookupKey)) {
      byLookupKey.set(lookupKey, []);
    }

    byLookupKey.get(lookupKey).push(row);
  });

  return {
    byLookupKey,
    ambiguousKeys: new Set(
      Array.from(byLookupKey.entries())
        .filter(([, matches]) => matches.length > 1)
        .map(([lookupKey]) => lookupKey),
    ),
  };
}

function collectDuplicateLookupKeys(rows = []) {
  const counts = new Map();

  rows.forEach((row) => {
    if (!row?.lookupKey) {
      return;
    }

    counts.set(row.lookupKey, (counts.get(row.lookupKey) ?? 0) + 1);
  });

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([lookupKey]) => lookupKey),
  );
}

function buildReferenceRegistry(existingIndex, upsertRows) {
  const uniqueEntries = new Map();

  for (const [lookupKey, matches] of existingIndex.byLookupKey.entries()) {
    if (matches.length === 1) {
      uniqueEntries.set(lookupKey, {
        row: matches[0],
        type: matches[0].type,
        id: Number(matches[0].id),
      });
    }
  }

  upsertRows.forEach((row) => {
    uniqueEntries.set(row.lookupKey, {
      row: row.existingRow ?? null,
      type: row.type,
      id: row.existingRow ? Number(row.existingRow.id) : null,
    });
  });

  return {
    ambiguousExistingKeys: existingIndex.ambiguousKeys,
    uniqueEntries,
  };
}

function resolveReference(registry, lookupKey, sheetName, rowNumber, columnName, entityLabel, errors) {
  if (registry.ambiguousExistingKeys.has(lookupKey) && !registry.uniqueEntries.has(lookupKey)) {
    errors.push(
      createImportError(
        sheetName,
        rowNumber,
        columnName,
        `${entityLabel.toUpperCase()}_REFERENCE_AMBIGUOUS`,
        `Multiple existing ${entityLabel} rows match "${columnName}". Rename duplicates before importing.`,
      ),
    );
    return null;
  }

  const entry = registry.uniqueEntries.get(lookupKey);
  if (!entry) {
    errors.push(
      createImportError(
        sheetName,
        rowNumber,
        columnName,
        `${entityLabel.toUpperCase()}_REFERENCE_NOT_FOUND`,
        `No ${entityLabel} matched "${columnName}" after applying workbook rows.`,
      ),
    );
    return null;
  }

  return entry;
}

function validateEntityUpserts(rawRows, sheetName, allowedTypes, existingIndex, options = {}) {
  const errors = [];
  const parsedRows = [];

  rawRows.forEach((rawRow) => {
    const name = parseTextField(rawRow, sheetName, 'name', errors, {
      required: true,
      collapseWhitespace: true,
      maxLength: NAME_MAX_LENGTH,
    });
    const type = parseEnumField(rawRow, sheetName, 'type', allowedTypes, errors);
    const description = parseTextField(rawRow, sheetName, 'description', errors, {
      required: false,
      collapseWhitespace: false,
      maxLength: DESCRIPTION_MAX_LENGTH,
    });
    const archived = options.allowArchived
      ? parseOptionalBooleanField(rawRow, sheetName, 'archived', errors, undefined)
      : undefined;

    if (!name || !type) {
      return;
    }

    parsedRows.push({
      rowNumber: rawRow.rowNumber,
      name,
      lookupKey: toCaseInsensitiveLookupKey(name),
      type,
      description,
      archived,
    });
  });

  const duplicateLookupKeys = collectDuplicateLookupKeys(parsedRows);
  const rowsToUpsert = [];

  parsedRows.forEach((row) => {
    if (duplicateLookupKeys.has(row.lookupKey)) {
      errors.push(
        createImportError(
          sheetName,
          row.rowNumber,
          'name',
          'DUPLICATE_NAME_IN_SHEET',
          `Duplicate "${row.name}" found in worksheet "${sheetName}".`,
        ),
      );
      return;
    }

    if (existingIndex.ambiguousKeys.has(row.lookupKey)) {
      errors.push(
        createImportError(
          sheetName,
          row.rowNumber,
          'name',
          'DUPLICATE_NAME_IN_DB',
          `Multiple existing ${sheetName.slice(0, -1)} rows already match "${row.name}".`,
        ),
      );
      return;
    }

    const existingMatches = existingIndex.byLookupKey.get(row.lookupKey) ?? [];
    const existingRow = existingMatches[0] ?? null;

    if (existingRow && normalizeTrimmedString(String(existingRow.type ?? '')).toLocaleLowerCase() !== row.type) {
      errors.push(
        createImportError(
          sheetName,
          row.rowNumber,
          'type',
          `${sheetName.slice(0, -1).toUpperCase()}_TYPE_MISMATCH`,
          `Existing ${sheetName.slice(0, -1)} "${row.name}" has type "${existingRow.type}", not "${row.type}".`,
        ),
      );
      return;
    }

    rowsToUpsert.push({
      ...row,
      existingRow,
    });
  });

  return {
    errors,
    rowsToUpsert,
  };
}

function validateTransactions(rawRows, accountRegistry, categoryRegistry) {
  const errors = [];
  const transactionsToInsert = [];

  rawRows.forEach((rawRow) => {
    const date = parseDateField(rawRow, 'transactions', 'date', errors);
    const amountCents = parseAmountField(rawRow, 'transactions', 'amount', errors, {
      allowNegative: true,
    });
    const categoryName = parseTextField(rawRow, 'transactions', 'category', errors, {
      required: true,
      collapseWhitespace: true,
      maxLength: NAME_MAX_LENGTH,
    });
    const accountName = parseTextField(rawRow, 'transactions', 'account', errors, {
      required: true,
      collapseWhitespace: true,
      maxLength: NAME_MAX_LENGTH,
    });
    const description = parseTextField(rawRow, 'transactions', 'description', errors, {
      required: false,
      collapseWhitespace: false,
      maxLength: DESCRIPTION_MAX_LENGTH,
    });
    const settled = parseStrictBooleanField(rawRow, 'transactions', 'settled', errors, false);
    const categoryType = parseEnumField(rawRow, 'transactions', 'category_type', CATEGORY_TYPES, []);

    const rowHasBlockingValues = date !== null && amountCents !== null && categoryName && accountName;
    if (!rowHasBlockingValues) {
      return;
    }

    const accountLookupKey = toCaseInsensitiveLookupKey(accountName);
    const categoryLookupKey = toCaseInsensitiveLookupKey(categoryName);
    const accountEntry = resolveReference(
      accountRegistry,
      accountLookupKey,
      'transactions',
      rawRow.rowNumber,
      'account',
      'account',
      errors,
    );
    const categoryEntry = resolveReference(
      categoryRegistry,
      categoryLookupKey,
      'transactions',
      rawRow.rowNumber,
      'category',
      'category',
      errors,
    );

    if (categoryEntry && Number(categoryEntry.id) === TRANSFER_CATEGORY_ID) {
      errors.push(
        createImportError(
          'transactions',
          rawRow.rowNumber,
          'category',
          'SYSTEM_CATEGORY_NOT_ALLOWED',
          'The transfer system category cannot be used in the transactions sheet.',
        ),
      );
    }

    if (categoryType && categoryEntry && categoryEntry.type !== categoryType) {
      errors.push(
        createImportError(
          'transactions',
          rawRow.rowNumber,
          'category_type',
          'CATEGORY_TYPE_MISMATCH',
          `Category "${categoryName}" has type "${categoryEntry.type}", not "${categoryType}".`,
        ),
      );
    }

    const rowErrors = errors.some((error) => error.sheet === 'transactions' && error.row === rawRow.rowNumber);
    if (rowErrors) {
      return;
    }

    transactionsToInsert.push({
      rowNumber: rawRow.rowNumber,
      occurred_at: date,
      amount_cents: amountCents,
      account_lookup_key: accountLookupKey,
      category_lookup_key: categoryLookupKey,
      description,
      settled,
    });
  });

  return {
    errors,
    transactionsToInsert,
  };
}

function validateTransfers(rawRows, accountRegistry) {
  const errors = [];
  const transfersToInsert = [];

  rawRows.forEach((rawRow) => {
    const date = parseDateField(rawRow, 'transfers', 'date', errors);
    const amountCents = parseAmountField(rawRow, 'transfers', 'amount', errors, {
      allowNegative: false,
      requirePositive: true,
    });
    const senderAccountName = parseTextField(rawRow, 'transfers', 'sender_account', errors, {
      required: true,
      collapseWhitespace: true,
      maxLength: NAME_MAX_LENGTH,
    });
    const receiverAccountName = parseTextField(rawRow, 'transfers', 'receiver_account', errors, {
      required: true,
      collapseWhitespace: true,
      maxLength: NAME_MAX_LENGTH,
    });
    const description = parseTextField(rawRow, 'transfers', 'description', errors, {
      required: false,
      collapseWhitespace: false,
      maxLength: DESCRIPTION_MAX_LENGTH,
    });
    const settled = parseStrictBooleanField(rawRow, 'transfers', 'settled', errors, false);

    const rowHasBlockingValues = date !== null && amountCents !== null && senderAccountName && receiverAccountName;
    if (!rowHasBlockingValues) {
      return;
    }

    const senderAccountLookupKey = toCaseInsensitiveLookupKey(senderAccountName);
    const receiverAccountLookupKey = toCaseInsensitiveLookupKey(receiverAccountName);

    if (senderAccountLookupKey === receiverAccountLookupKey) {
      errors.push(
        createImportError(
          'transfers',
          rawRow.rowNumber,
          'receiver_account',
          'SAME_ACCOUNT_NOT_ALLOWED',
          'sender_account and receiver_account must be different.',
        ),
      );
      return;
    }

    resolveReference(
      accountRegistry,
      senderAccountLookupKey,
      'transfers',
      rawRow.rowNumber,
      'sender_account',
      'account',
      errors,
    );
    resolveReference(
      accountRegistry,
      receiverAccountLookupKey,
      'transfers',
      rawRow.rowNumber,
      'receiver_account',
      'account',
      errors,
    );

    const rowErrors = errors.some((error) => error.sheet === 'transfers' && error.row === rawRow.rowNumber);
    if (rowErrors) {
      return;
    }

    transfersToInsert.push({
      rowNumber: rawRow.rowNumber,
      occurred_at: date,
      amount_cents: amountCents,
      sender_account_lookup_key: senderAccountLookupKey,
      receiver_account_lookup_key: receiverAccountLookupKey,
      description,
      settled,
    });
  });

  return {
    errors,
    transfersToInsert,
  };
}

function validateAndNormalize(rows, database = getDatabase()) {
  const normalizedDatabase = ensureDatabase(database);
  const accountRows = selectRows(normalizedDatabase, 'accounts');
  const categoryRows = selectRows(normalizedDatabase, 'categories');
  const existingAccounts = buildExistingEntityIndex(accountRows);
  const existingCategories = buildExistingEntityIndex(categoryRows);
  const accountValidation = validateEntityUpserts(
    Array.isArray(rows?.accounts) ? rows.accounts : [],
    'accounts',
    ACCOUNT_TYPES,
    existingAccounts,
    { allowArchived: true },
  );
  const categoryValidation = validateEntityUpserts(
    Array.isArray(rows?.categories) ? rows.categories : [],
    'categories',
    CATEGORY_TYPES,
    existingCategories,
    { allowArchived: true },
  );
  const accountRegistry = buildReferenceRegistry(existingAccounts, accountValidation.rowsToUpsert);
  const categoryRegistry = buildReferenceRegistry(existingCategories, categoryValidation.rowsToUpsert);
  const transactionValidation = validateTransactions(
    Array.isArray(rows?.transactions) ? rows.transactions : [],
    accountRegistry,
    categoryRegistry,
  );
  const transferValidation = validateTransfers(
    Array.isArray(rows?.transfers) ? rows.transfers : [],
    accountRegistry,
  );

  const errors = sortErrors([
    ...accountValidation.errors,
    ...categoryValidation.errors,
    ...transactionValidation.errors,
    ...transferValidation.errors,
  ]);

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    errors: [],
    summary: {
      accounts: accountValidation.rowsToUpsert.length,
      categories: categoryValidation.rowsToUpsert.length,
      transactions: transactionValidation.transactionsToInsert.length,
      transfers: transferValidation.transfersToInsert.length,
    },
    data: {
      accountsToUpsert: accountValidation.rowsToUpsert,
      categoriesToUpsert: categoryValidation.rowsToUpsert,
      transactionsToInsert: transactionValidation.transactionsToInsert,
      transfersToInsert: transferValidation.transfersToInsert,
    },
  };
}

function isBlankText(value) {
  return value === null || value === undefined || String(value).trim().length === 0;
}

function buildUniqueLookupMap(rows = []) {
  const map = new Map();

  rows.forEach((row) => {
    if (typeof row?.name !== 'string' || row.name.trim().length === 0) {
      return;
    }

    map.set(toCaseInsensitiveLookupKey(row.name), row);
  });

  return map;
}

function buildInsertRowFromDto(dto, importedAt) {
  return {
    name: dto.name,
    type: dto.type,
    ...(dto.description === null ? {} : { description: dto.description }),
    ...(dto.archived === undefined ? {} : { archived: dto.archived }),
    created_at: importedAt,
  };
}

function executeImport(database, normalizedData, options = {}) {
  const normalizedDatabase = ensureDatabase(database);

  if (!normalizedData || typeof normalizedData !== 'object' || Array.isArray(normalizedData)) {
    throw new Error('normalizedData must be a plain object.');
  }

  const runImport = normalizedDatabase.transaction((data) => {
    void options;

    const importedAt = Date.now();
    const result = {
      accountsInserted: 0,
      accountsUpdated: 0,
      accountsSkipped: 0,
      categoriesInserted: 0,
      categoriesUpdated: 0,
      categoriesSkipped: 0,
      transactionsInserted: 0,
      transfersInserted: 0,
    };

    const accountLookup = buildUniqueLookupMap(selectRows(normalizedDatabase, 'accounts'));
    const categoryLookup = buildUniqueLookupMap(selectRows(normalizedDatabase, 'categories'));

    data.accountsToUpsert.forEach((accountDto) => {
      const existingAccount = accountLookup.get(accountDto.lookupKey) ?? null;

      if (!existingAccount) {
        const insertedId = accountsModel.create(buildInsertRowFromDto(accountDto, importedAt));
        const createdAccount = accountsModel.getById(Number(insertedId));

        if (!createdAccount) {
          throw new Error(`Failed to create account "${accountDto.name}".`);
        }

        accountLookup.set(accountDto.lookupKey, createdAccount);
        result.accountsInserted += 1;
        return;
      }

      const shouldUpdateDescription =
        accountDto.description !== null &&
        isBlankText(existingAccount.description) &&
        Number(existingAccount.locked ?? 0) !== 1;

      if (!shouldUpdateDescription) {
        result.accountsSkipped += 1;
        return;
      }

      accountsModel.updateById(Number(existingAccount.id), {
        description: accountDto.description,
        updated_at: importedAt,
      });

      const updatedAccount = accountsModel.getById(Number(existingAccount.id));
      if (!updatedAccount) {
        throw new Error(`Failed to reload account "${accountDto.name}".`);
      }

      accountLookup.set(accountDto.lookupKey, updatedAccount);
      result.accountsUpdated += 1;
    });

    data.categoriesToUpsert.forEach((categoryDto) => {
      const existingCategory = categoryLookup.get(categoryDto.lookupKey) ?? null;

      if (!existingCategory) {
        const insertedId = categoriesModel.create(buildInsertRowFromDto(categoryDto, importedAt));
        const createdCategory = categoriesModel.getById(Number(insertedId));

        if (!createdCategory) {
          throw new Error(`Failed to create category "${categoryDto.name}".`);
        }

        categoryLookup.set(categoryDto.lookupKey, createdCategory);
        result.categoriesInserted += 1;
        return;
      }

      const shouldUpdateDescription =
        categoryDto.description !== null &&
        isBlankText(existingCategory.description) &&
        Number(existingCategory.locked ?? 0) !== 1;

      if (!shouldUpdateDescription) {
        result.categoriesSkipped += 1;
        return;
      }

      categoriesModel.updateById(Number(existingCategory.id), {
        description: categoryDto.description,
        updated_at: importedAt,
      });

      const updatedCategory = categoriesModel.getById(Number(existingCategory.id));
      if (!updatedCategory) {
        throw new Error(`Failed to reload category "${categoryDto.name}".`);
      }

      categoryLookup.set(categoryDto.lookupKey, updatedCategory);
      result.categoriesUpdated += 1;
    });

    data.transactionsToInsert.forEach((transactionDto) => {
      const account = accountLookup.get(transactionDto.account_lookup_key);
      const category = categoryLookup.get(transactionDto.category_lookup_key);

      if (!account) {
        throw new Error(`Account not found during transaction import at row ${transactionDto.rowNumber}.`);
      }

      if (!category) {
        throw new Error(`Category not found during transaction import at row ${transactionDto.rowNumber}.`);
      }

      if (Number(category.id) === TRANSFER_CATEGORY_ID) {
        throw new Error(`Transfer category is not allowed in transactions at row ${transactionDto.rowNumber}.`);
      }

      transactionsModel.create({
        account_id: Number(account.id),
        category_id: Number(category.id),
        occurred_at: transactionDto.occurred_at,
        amount_cents: transactionDto.amount_cents,
        ...(transactionDto.description === null ? {} : { description: transactionDto.description }),
        settled: transactionDto.settled,
        created_at: importedAt,
      });

      result.transactionsInserted += 1;
    });

    data.transfersToInsert.forEach((transferDto) => {
      const senderAccount = accountLookup.get(transferDto.sender_account_lookup_key);
      const receiverAccount = accountLookup.get(transferDto.receiver_account_lookup_key);

      if (!senderAccount || !receiverAccount) {
        throw new Error(`Account not found during transfer import at row ${transferDto.rowNumber}.`);
      }

      if (Number(senderAccount.id) === Number(receiverAccount.id)) {
        throw new Error(`Transfer accounts must be different at row ${transferDto.rowNumber}.`);
      }

      transfersModel.create({
        from_account_id: Number(senderAccount.id),
        to_account_id: Number(receiverAccount.id),
        occurred_at: transferDto.occurred_at,
        amount_cents: transferDto.amount_cents,
        ...(transferDto.description === null ? {} : { description: transferDto.description }),
        settled: transferDto.settled,
        created_at: importedAt,
      });

      result.transfersInserted += 1;
    });

    return result;
  });

  return runImport(normalizedData);
}

async function prepareImport(filePath, database = getDatabase()) {
  try {
    const parsedWorkbook = await parseWorkbook(filePath);
    if (!parsedWorkbook.ok) {
      return {
        ok: false,
        errors: parsedWorkbook.errors,
      };
    }

    return validateAndNormalize(parsedWorkbook.rows, database);
  } catch (error) {
    return {
      ok: false,
      errors: [
        createImportError(
          'workbook',
          1,
          undefined,
          'WORKBOOK_READ_FAILED',
          error instanceof Error ? error.message : String(error),
        ),
      ],
    };
  }
}

module.exports = {
  executeImport,
  parseWorkbook,
  prepareImport,
  validateAndNormalize,
  validateWorkbookStructure,
};
