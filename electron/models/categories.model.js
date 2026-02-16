const { createBaseModel } = require('./base-model');

const categoriesBaseModel = createBaseModel('categories');

module.exports = {
  ...categoriesBaseModel,
};
