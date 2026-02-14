const { getDatabase } = require('../database');
const { createBaseModel } = require('./base-model');

const categoriesBaseModel = createBaseModel('categories');

function listByType(type, options = {}) {
  return categoriesBaseModel.list({ type }, options);
}

function listByParent(parentId, options = {}) {
  return categoriesBaseModel.list({ parent_id: parentId }, options);
}

function listRoot(options = {}) {
  const database = getDatabase();
  const params = [];
  let sql = 'SELECT * FROM "categories" WHERE "parent_id" IS NULL ORDER BY "id" ASC';
  const hasLimit = Number.isInteger(options.limit) && options.limit > 0;
  const hasOffset = Number.isInteger(options.offset) && options.offset >= 0;

  if (hasLimit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  if (hasOffset && !hasLimit) {
    sql += ' LIMIT -1';
  }

  if (hasOffset) {
    sql += ' OFFSET ?';
    params.push(options.offset);
  }

  return database.prepare(sql).all(params);
}

module.exports = {
  ...categoriesBaseModel,
  listByType,
  listByParent,
  listRoot,
};
