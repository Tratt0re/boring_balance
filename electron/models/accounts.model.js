const { createBaseModel } = require('./base-model');

const accountsBaseModel = createBaseModel('accounts');

function listActive(options = {}) {
  return accountsBaseModel.list({ archived: 0 }, options);
}

module.exports = {
  ...accountsBaseModel,
  listActive,
};
