const { closeDatabase, createDatabase, getDatabase } = require('./db');
const { countRows, deleteRows, insertRow, selectOne, selectRows, updateRows } = require('./core_op');
const { getSchemaFilePaths, initSchema } = require('./schema');
const { isFirstStart, markFirstStartCompleted } = require('./system');

module.exports = {
  closeDatabase,
  countRows,
  createDatabase,
  deleteRows,
  getDatabase,
  getSchemaFilePaths,
  initSchema,
  isFirstStart,
  insertRow,
  markFirstStartCompleted,
  selectOne,
  selectRows,
  updateRows,
};
