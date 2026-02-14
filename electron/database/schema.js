const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_DIR = path.join(__dirname, 'schemas');

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
}

module.exports = {
  initSchema,
  getSchemaFilePaths,
};
