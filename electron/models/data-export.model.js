const { getDatabase, selectOne, selectRows } = require('../database');
const { TRANSFER_CATEGORY_NAME } = require('./transactions/constants');
const { formatUnixTimestampMillisecondsToDate } = require('../utils/date-utils');
const {
  addWorksheetFromObjects,
  createWorkbook,
  writeWorkbookToBuffer,
} = require('../utils/excel-utils');

const TRANSACTIONS_SHEET_NAME = 'transactions';
const TRANSFERS_SHEET_NAME = 'transfers';
const ACCOUNTS_SHEET_NAME = 'accounts';
const CATEGORIES_SHEET_NAME = 'categories';

const TRANSACTIONS_COLUMNS = Object.freeze([
  'date',
  'settled',
  'amount',
  'category',
  'category_type',
  'account',
  'description',
]);
const TRANSFERS_COLUMNS = Object.freeze([
  'date',
  'settled',
  'sender_account',
  'receiver_account',
  'amount',
  'description',
]);
const ACCOUNTS_COLUMNS = Object.freeze([
  'account',
  'type',
  'archived',
]);
const CATEGORIES_COLUMNS = Object.freeze([
  'category',
  'type',
  'archived',
]);

function ensureDatabase(database) {
  if (!database || typeof database.prepare !== 'function') {
    throw new Error('database must be an initialized better-sqlite3 Database instance.');
  }

  return database;
}

function formatBooleanCell(value) {
  return Number(value) === 1 ? 'TRUE' : 'FALSE';
}

function formatAmountFromCents(value) {
  return Number(value) / 100;
}

function formatDateCell(unixTimestampMilliseconds) {
  return formatUnixTimestampMillisecondsToDate(unixTimestampMilliseconds, {
    format: 'DD-MM-YYYY',
  });
}

function resolveTransferCategoryId(database) {
  const transferCategory = selectOne(database, 'categories', {
    name: TRANSFER_CATEGORY_NAME,
    locked: 1,
  });

  if (!transferCategory) {
    throw new Error(`System transfer category not found for "${TRANSFER_CATEGORY_NAME}".`);
  }

  return Number(transferCategory.id);
}

function selectTransactionSheetRows(database, transferCategoryId) {
  const sql = `
    SELECT
      t.occurred_at AS occurred_at,
      t.settled AS settled,
      t.amount_cents AS amount_cents,
      c.name AS category,
      c.type AS category_type,
      a.name AS account,
      t.description AS description
    FROM transactions AS t
    INNER JOIN categories AS c ON c.id = t.category_id
    INNER JOIN accounts AS a ON a.id = t.account_id
    WHERE t.transfer_id IS NULL
      AND t.category_id != ?
    ORDER BY
      t.occurred_at ASC,
      COALESCE(t.created_at, t.occurred_at) ASC,
      t.id ASC
  `;

  return database.prepare(sql).all(transferCategoryId).map((row) => ({
    date: formatDateCell(row.occurred_at),
    settled: formatBooleanCell(row.settled),
    amount: formatAmountFromCents(row.amount_cents),
    category: row.category,
    category_type: row.category_type,
    account: row.account,
    description: row.description ?? '',
  }));
}

function selectTransferSheetRows(database) {
  const sql = `
    SELECT
      t.occurred_at AS occurred_at,
      t.settled AS settled,
      sender.name AS sender_account,
      receiver.name AS receiver_account,
      t.amount_cents AS amount_cents,
      t.description AS description
    FROM transfers AS t
    INNER JOIN accounts AS sender ON sender.id = t.from_account_id
    INNER JOIN accounts AS receiver ON receiver.id = t.to_account_id
    ORDER BY
      t.occurred_at ASC,
      COALESCE(t.created_at, t.occurred_at) ASC,
      t.id ASC
  `;

  return database.prepare(sql).all().map((row) => ({
    date: formatDateCell(row.occurred_at),
    settled: formatBooleanCell(row.settled),
    sender_account: row.sender_account,
    receiver_account: row.receiver_account,
    amount: formatAmountFromCents(row.amount_cents),
    description: row.description ?? '',
  }));
}

function selectAccountSheetRows(database) {
  return selectRows(database, 'accounts', {}, {
    orderBy: [
      { column: 'name', direction: 'ASC' },
      { column: 'id', direction: 'ASC' },
    ],
  }).map((row) => ({
    account: row.name,
    type: row.type,
    archived: formatBooleanCell(row.archived),
  }));
}

function selectCategorySheetRows(database) {
  return selectRows(database, 'categories', {}, {
    orderBy: [
      { column: 'name', direction: 'ASC' },
      { column: 'id', direction: 'ASC' },
    ],
  }).map((row) => ({
    category: row.name,
    type: row.type,
    archived: formatBooleanCell(row.archived),
  }));
}

async function buildExportWorkbook(database = getDatabase()) {
  const normalizedDatabase = ensureDatabase(database);
  const transferCategoryId = resolveTransferCategoryId(normalizedDatabase);
  const workbook = createWorkbook();

  addWorksheetFromObjects(
    workbook,
    TRANSACTIONS_SHEET_NAME,
    TRANSACTIONS_COLUMNS,
    selectTransactionSheetRows(normalizedDatabase, transferCategoryId),
  );
  addWorksheetFromObjects(
    workbook,
    TRANSFERS_SHEET_NAME,
    TRANSFERS_COLUMNS,
    selectTransferSheetRows(normalizedDatabase),
  );
  addWorksheetFromObjects(
    workbook,
    ACCOUNTS_SHEET_NAME,
    ACCOUNTS_COLUMNS,
    selectAccountSheetRows(normalizedDatabase),
  );
  addWorksheetFromObjects(
    workbook,
    CATEGORIES_SHEET_NAME,
    CATEGORIES_COLUMNS,
    selectCategorySheetRows(normalizedDatabase),
  );

  return writeWorkbookToBuffer(workbook);
}

module.exports = {
  buildExportWorkbook,
};
