const { createBaseModel } = require('./base-model');

const appMetaBaseModel = createBaseModel('app_meta', { idField: 'key' });

function getByKey(key) {
  return appMetaBaseModel.getById(key);
}

function updateByKey(key, changes) {
  return appMetaBaseModel.updateById(key, changes);
}

function deleteByKey(key) {
  return appMetaBaseModel.deleteById(key);
}

module.exports = {
  ...appMetaBaseModel,
  getByKey,
  updateByKey,
  deleteByKey,
};
