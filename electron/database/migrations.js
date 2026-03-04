const fs = require('node:fs');
const path = require('node:path');
const { ensureRequiredAppMeta } = require('./schema');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function getMigrationFilePaths() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => path.join(MIGRATIONS_DIR, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function runMigrations(database) {
  const migrationFilePaths = getMigrationFilePaths();
  for (const migrationFilePath of migrationFilePaths) {
    const sql = fs.readFileSync(migrationFilePath, 'utf8').trim();
    if (!sql) {
      continue;
    }

    database.exec(sql);
    console.log('[electron] Applied migration ->', path.basename(migrationFilePath));
  }

  ensureRequiredAppMeta(database);
}

module.exports = {
  getMigrationFilePaths,
  runMigrations,
};
