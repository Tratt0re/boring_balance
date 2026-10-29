const { createBaseModel } = require('./base-model');

const appMetaBaseModel = createBaseModel('app_meta', { idField: 'key' });

function getByKey(key) {
  return appMetaBaseModel.getById(key);
}

function updateByKey(key, changes) {
  return appMetaBaseModel.updateById(key, changes);
}

module.exports = {
  ...appMetaBaseModel,
  getByKey,
  updateByKey,
};
