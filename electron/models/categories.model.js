const { countRows, getDatabase } = require('../database');
const { createBaseModel } = require('./base-model');

const categoriesBaseModel = createBaseModel('categories');

/** How many rows still point at the category (a foreign key would refuse its deletion). */
function countReferences(categoryId) {
  const database = getDatabase();

  return {
    transactions: countRows(database, 'transactions', { category_id: categoryId }),
    subcategories: countRows(database, 'categories', { parent_id: categoryId }),
  };
}

module.exports = {
  ...categoriesBaseModel,
  countReferences,
};
