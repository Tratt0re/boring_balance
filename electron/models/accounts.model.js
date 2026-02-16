const { createBaseModel } = require('./base-model');

const accountsBaseModel = createBaseModel('accounts');

module.exports = {
  ...accountsBaseModel,
};
