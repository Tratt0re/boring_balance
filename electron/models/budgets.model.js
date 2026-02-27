const { createBaseModel } = require('./base-model');

const budgetsBaseModel = createBaseModel('budgets');

module.exports = {
  ...budgetsBaseModel,
};
