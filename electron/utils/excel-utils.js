const ExcelJS = require('exceljs');

function normalizeLookupKey(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLocaleLowerCase().replace(/[\s-]+/g, '_');
}

function ensureWorkbook(workbook) {
  if (!workbook || typeof workbook.addWorksheet !== 'function' || !workbook.xlsx) {
    throw new Error('workbook must be a valid ExcelJS workbook instance.');
  }

  return workbook;
}

function normalizeColumnKeys(columnKeys) {
  if (!Array.isArray(columnKeys) || columnKeys.length === 0) {
    throw new Error('columnKeys must be a non-empty array.');
  }

  return columnKeys.map((columnKey, index) => {
    if (typeof columnKey !== 'string' || columnKey.trim().length === 0) {
      throw new Error(`columnKeys[${index}] must be a non-empty string.`);
    }

    return columnKey.trim();
  });
}

function createWorkbook(options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator =
    typeof options.creator === 'string' && options.creator.trim().length > 0 ? options.creator.trim() : 'Boring Balance';
  workbook.created = new Date();

  return workbook;
}

async function readWorkbookFromFile(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error('filePath must be a non-empty string.');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath.trim());

  return workbook;
}

function findWorksheetByAliases(workbook, sheetNames = []) {
  const normalizedWorkbook = ensureWorkbook(workbook);
  if (!Array.isArray(sheetNames) || sheetNames.length === 0) {
    throw new Error('sheetNames must be a non-empty array.');
  }

  const normalizedSheetNames = new Set(sheetNames.map((sheetName) => normalizeLookupKey(String(sheetName ?? ''))));
  return normalizedWorkbook.worksheets.find((worksheet) => normalizedSheetNames.has(normalizeLookupKey(worksheet.name))) ?? null;
}

function readWorksheetHeaderMap(worksheet) {
  if (!worksheet || typeof worksheet.getRow !== 'function') {
    throw new Error('worksheet must be a valid ExcelJS worksheet instance.');
  }

  const headerRow = worksheet.getRow(1);
  const headerMap = new Map();
  const maxColumnCount = Math.max(headerRow.cellCount, headerRow.actualCellCount, worksheet.columnCount);

  for (let columnIndex = 1; columnIndex <= maxColumnCount; columnIndex += 1) {
    const headerText = String(headerRow.getCell(columnIndex).text ?? '').trim();
    if (headerText.length === 0) {
      continue;
    }

    headerMap.set(normalizeLookupKey(headerText), {
      column: columnIndex,
      header: headerText,
    });
  }

  return headerMap;
}

function readCellValue(cell) {
  const rawValue = cell?.value;
  const isFormula =
    rawValue !== null &&
    rawValue !== undefined &&
    typeof rawValue === 'object' &&
    !Array.isArray(rawValue) &&
    Object.prototype.hasOwnProperty.call(rawValue, 'formula');

  if (rawValue === null || rawValue === undefined) {
    return {
      rawValue,
      text: '',
      isFormula,
    };
  }

  if (rawValue instanceof Date) {
    const day = String(rawValue.getDate()).padStart(2, '0');
    const month = String(rawValue.getMonth() + 1).padStart(2, '0');
    const year = rawValue.getFullYear();

    return {
      rawValue,
      text: `${day}/${month}/${year}`,
      isFormula,
    };
  }

  if (typeof rawValue === 'object' && Array.isArray(rawValue.richText)) {
    return {
      rawValue,
      text: rawValue.richText.map((entry) => entry?.text ?? '').join(''),
      isFormula,
    };
  }

  if (typeof rawValue === 'object' && typeof rawValue.text === 'string') {
    return {
      rawValue,
      text: rawValue.text,
      isFormula,
    };
  }

  return {
    rawValue,
    text: String(cell.text ?? rawValue),
    isFormula,
  };
}

function mapWorksheetRows(worksheet, fieldColumns = {}) {
  if (!worksheet || typeof worksheet.eachRow !== 'function') {
    throw new Error('worksheet must be a valid ExcelJS worksheet instance.');
  }

  if (!fieldColumns || typeof fieldColumns !== 'object' || Array.isArray(fieldColumns)) {
    throw new Error('fieldColumns must be a plain object.');
  }

  const rows = [];
  const fieldNames = Object.keys(fieldColumns);

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const values = {};
    let hasContent = false;

    for (const fieldName of fieldNames) {
      const columnIndex = fieldColumns[fieldName];
      if (!Number.isInteger(columnIndex) || columnIndex <= 0) {
        values[fieldName] = {
          rawValue: undefined,
          text: '',
          isFormula: false,
        };
        continue;
      }

      const cellValue = readCellValue(row.getCell(columnIndex));
      if (cellValue.isFormula || String(cellValue.text ?? '').trim().length > 0) {
        hasContent = true;
      }

      values[fieldName] = cellValue;
    }

    if (!hasContent) {
      return;
    }

    rows.push({
      rowNumber,
      values,
    });
  });

  return rows;
}

function addWorksheetFromObjects(workbook, sheetName, columnKeys, rows = []) {
  const normalizedWorkbook = ensureWorkbook(workbook);
  if (typeof sheetName !== 'string' || sheetName.trim().length === 0) {
    throw new Error('sheetName must be a non-empty string.');
  }

  if (!Array.isArray(rows)) {
    throw new Error('rows must be an array.');
  }

  const normalizedColumnKeys = normalizeColumnKeys(columnKeys);
  const worksheet = normalizedWorkbook.addWorksheet(sheetName.trim());

  worksheet.addRow(normalizedColumnKeys);

  rows.forEach((row, rowIndex) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`rows[${rowIndex}] must be a plain object.`);
    }

    worksheet.addRow(normalizedColumnKeys.map((columnKey) => row[columnKey]));
  });

  return worksheet;
}

async function writeWorkbookToBuffer(workbook) {
  const normalizedWorkbook = ensureWorkbook(workbook);
  const content = await normalizedWorkbook.xlsx.writeBuffer();

  if (Buffer.isBuffer(content)) {
    return content;
  }

  if (content instanceof Uint8Array) {
    return Buffer.from(content);
  }

  return Buffer.from(content);
}

module.exports = {
  addWorksheetFromObjects,
  createWorkbook,
  findWorksheetByAliases,
  mapWorksheetRows,
  normalizeLookupKey,
  readCellValue,
  readWorkbookFromFile,
  readWorksheetHeaderMap,
  writeWorkbookToBuffer,
};
