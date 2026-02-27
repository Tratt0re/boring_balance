const { closeDatabase, createDatabase, getDatabase, getDatabasePath } = require('./db');
const {
  countRows,
  deleteRows,
  insertRow,
  selectDistinctYearsFromUnixTimestampColumn,
  selectOne,
  selectRows,
  updateRows,
} = require('./core_op');
const { getMigrationFilePaths, runMigrations } = require('./migrations');
const { getSchemaFilePaths, initSchema } = require('./schema');
const { isFirstStart, markFirstStartCompleted } = require('./system');

module.exports = {
  closeDatabase,
  countRows,
  createDatabase,
  deleteRows,
  getDatabase,
  getDatabasePath,
  getMigrationFilePaths,
  getSchemaFilePaths,
  initSchema,
  isFirstStart,
  insertRow,
  markFirstStartCompleted,
  runMigrations,
  selectDistinctYearsFromUnixTimestampColumn,
  selectOne,
  selectRows,
  updateRows,
};
