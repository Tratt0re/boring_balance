const { countRows, deleteRows, getDatabase, insertRow, selectOne, selectRows, updateRows } = require('../database');

function createBaseModel(tableName, options = {}) {
  const idField = options.idField ?? 'id';

  function create(row) {
    return insertRow(getDatabase(), tableName, row);
  }

  function getById(id) {
    return selectOne(getDatabase(), tableName, { [idField]: id });
  }

  function list(where = {}, listOptions = {}) {
    return selectRows(getDatabase(), tableName, where, listOptions);
  }

  function count(where = {}) {
    return countRows(getDatabase(), tableName, where);
  }

  function updateById(id, changes) {
    return updateRows(getDatabase(), tableName, changes, { [idField]: id });
  }

  function deleteById(id) {
    return deleteRows(getDatabase(), tableName, { [idField]: id });
  }

  return {
    tableName,
    idField,
    create,
    getById,
    list,
    count,
    updateById,
    deleteById,
  };
}

module.exports = {
  createBaseModel,
};
