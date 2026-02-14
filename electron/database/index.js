const { closeDatabase, createDatabase, getDatabase } = require('./db');
const { countRows, deleteRows, insertRow, selectOne, selectRows, updateRows } = require('./core_op');
const { getSchemaFilePaths, initSchema } = require('./schema');
const { isInitializationCompleted, markInitializationCompleted } = require('./system');

module.exports = {
  closeDatabase,
  countRows,
  createDatabase,
  deleteRows,
  getDatabase,
  getSchemaFilePaths,
  initSchema,
  isInitializationCompleted,
  insertRow,
  markInitializationCompleted,
  selectOne,
  selectRows,
  updateRows,
};
