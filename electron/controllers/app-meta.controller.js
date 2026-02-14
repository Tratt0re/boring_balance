const { appMetaModel } = require('../models');
const {
  ensureHasKeys,
  ensurePlainObject,
  extractListPayload,
  extractString,
  pickDefined,
  requireString,
} = require('./utils');

function create(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const row = {
    key: requireString(body.key, 'key', { allowEmpty: false }),
    value: requireString(body.value, 'value', { allowEmpty: true }),
  };

  appMetaModel.create(row);
  return appMetaModel.getByKey(row.key);
}

function get(payload) {
  const key = extractString(payload, 'key');
  return appMetaModel.getByKey(key);
}

function list(payload) {
  const { where, options } = extractListPayload(payload);
  return appMetaModel.list(where, options);
}

function update(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const key = requireString(body.key, 'key', { allowEmpty: false });
  const changesInput = ensurePlainObject(body.changes ?? {}, 'changes');
  const changes = pickDefined({
    value:
      changesInput.value === undefined
        ? undefined
        : requireString(changesInput.value, 'changes.value', { allowEmpty: true }),
  });

  ensureHasKeys(changes, 'changes');

  const changed = appMetaModel.updateByKey(key, changes);
  return {
    changed,
    row: appMetaModel.getByKey(key),
  };
}

function remove(payload) {
  const key = extractString(payload, 'key');
  const changed = appMetaModel.deleteByKey(key);

  return { changed };
}

function upsert(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const key = requireString(body.key, 'key', { allowEmpty: false });
  const value = requireString(body.value, 'value', { allowEmpty: true });
  const existingRow = appMetaModel.getByKey(key);

  if (!existingRow) {
    appMetaModel.create({ key, value });
  } else {
    appMetaModel.updateByKey(key, { value });
  }

  return appMetaModel.getByKey(key);
}

module.exports = {
  create,
  get,
  list,
  remove,
  update,
  upsert,
};
