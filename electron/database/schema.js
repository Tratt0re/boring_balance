const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { insertRow, selectOne, updateRows } = require('./core_op');

const SCHEMA_DIR = path.join(__dirname, 'schemas');
const APP_META_DB_UUID_KEY = 'db_uuid';
const APP_META_CHANGE_COUNTER_KEY = 'change_counter';
const APP_META_LAST_WRITE_MS_KEY = 'last_write_ms';
const APP_META_SCHEMA_VERSION_KEY = 'schema_version';
const APP_META_SCHEMA_VERSION = 1;

function ensureAppMetaValue(database, key, value) {
  const stringValue = String(value);
  const existingRow = selectOne(database, 'app_meta', { key });

  if (!existingRow) {
    insertRow(database, 'app_meta', { key, value: stringValue });
    return;
  }

  if (String(existingRow.value) === stringValue) {
    return;
  }

  updateRows(database, 'app_meta', { value: stringValue }, { key });
}

function ensureRequiredAppMeta(database) {
  if (!database || typeof database.prepare !== 'function') {
    throw new Error('database must be an initialized better-sqlite3 Database instance.');
  }

  const existingDbUuidRow = selectOne(database, 'app_meta', { key: APP_META_DB_UUID_KEY });
  if (typeof existingDbUuidRow?.value !== 'string' || existingDbUuidRow.value.trim().length === 0) {
    ensureAppMetaValue(database, APP_META_DB_UUID_KEY, randomUUID());
  }

  const existingChangeCounterRow = selectOne(database, 'app_meta', { key: APP_META_CHANGE_COUNTER_KEY });
  const existingChangeCounter = Number(existingChangeCounterRow?.value);
  if (!Number.isInteger(existingChangeCounter) || existingChangeCounter < 0) {
    ensureAppMetaValue(database, APP_META_CHANGE_COUNTER_KEY, 0);
  }

  const existingLastWriteMsRow = selectOne(database, 'app_meta', { key: APP_META_LAST_WRITE_MS_KEY });
  const existingLastWriteMs = Number(existingLastWriteMsRow?.value);
  if (!Number.isInteger(existingLastWriteMs) || existingLastWriteMs < 0) {
    ensureAppMetaValue(database, APP_META_LAST_WRITE_MS_KEY, Date.now());
  }

  const existingSchemaVersionRow = selectOne(database, 'app_meta', { key: APP_META_SCHEMA_VERSION_KEY });
  const existingSchemaVersion = Number(existingSchemaVersionRow?.value);
  if (!Number.isInteger(existingSchemaVersion) || existingSchemaVersion < 0) {
    ensureAppMetaValue(database, APP_META_SCHEMA_VERSION_KEY, APP_META_SCHEMA_VERSION);
  }
}

function getSchemaFilePaths() {
  if (!fs.existsSync(SCHEMA_DIR)) {
    return [];
  }

  return fs
    .readdirSync(SCHEMA_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => path.join(SCHEMA_DIR, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function initSchema(database) {
  const schemaFilePaths = getSchemaFilePaths();
  for (const schemaFilePath of schemaFilePaths) {
    const sql = fs.readFileSync(schemaFilePath, 'utf8').trim();
    if (!sql) {
      continue;
    }

    database.exec(sql);
    console.log('[electron] Applied schema definition ->', path.basename(schemaFilePath));
  }

  ensureRequiredAppMeta(database);
}

module.exports = {
  ensureRequiredAppMeta,
  initSchema,
  getSchemaFilePaths,
};
