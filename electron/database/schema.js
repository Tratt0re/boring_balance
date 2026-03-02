const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { insertRow, selectOne, updateRows } = require('./core_op');

const SCHEMA_DIR = path.join(__dirname, 'schemas');

function seedInitialAppMeta(database) {
  if (!database || typeof database.prepare !== 'function') {
    throw new Error('database must be an initialized better-sqlite3 Database instance.');
  }

  const existingDbUuidRow = selectOne(database, 'app_meta', { key: 'db_uuid' });
  if (typeof existingDbUuidRow?.value === 'string' && existingDbUuidRow.value.trim().length > 0) {
    return;
  }

  const nextDbUuid = randomUUID();
  if (existingDbUuidRow) {
    updateRows(database, 'app_meta', { value: nextDbUuid }, { key: 'db_uuid' });
    return;
  }

  insertRow(database, 'app_meta', {
    key: 'db_uuid',
    value: nextDbUuid,
  });
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

  seedInitialAppMeta(database);
}

module.exports = {
  initSchema,
  getSchemaFilePaths,
};
