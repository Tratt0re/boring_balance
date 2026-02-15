const { accountsModel } = require('../models');
const {
  assertAllowedKeys,
  ensureHasKeys,
  ensureNonEmptyObject,
  ensurePlainObject,
  extractId,
  extractListPayload,
  extractOptionsPayload,
  nowUnixTimestampMilliseconds,
  normalizeOptionalBooleanFlag,
  normalizeOptionalString,
  pickDefined,
  requireString,
} = require('./utils');

const ACCOUNT_FIELDS = new Set(['name', 'description', 'color_key', 'icon', 'archived']);

function normalizeAccountChanges(value, label, options = {}) {
  const changesInput = ensureNonEmptyObject(value, label);
  assertAllowedKeys(changesInput, ACCOUNT_FIELDS, label);

  const changes = pickDefined({
    name:
      changesInput.name === undefined
        ? undefined
        : requireString(changesInput.name, `${label}.name`, { allowEmpty: false }),
    description: normalizeOptionalString(changesInput.description, `${label}.description`),
    color_key: normalizeOptionalString(changesInput.color_key, `${label}.color_key`),
    icon: normalizeOptionalString(changesInput.icon, `${label}.icon`),
    archived: normalizeOptionalBooleanFlag(changesInput.archived, `${label}.archived`),
  });

  ensureHasKeys(changes, label);

  if (!options.partial && changes.name === undefined) {
    throw new Error(`${label}.name is required.`);
  }

  return changes;
}

function create(payload) {
  const row = {
    ...normalizeAccountChanges(payload, 'payload', { partial: false }),
    created_at: nowUnixTimestampMilliseconds(),
  };
  const insertedId = accountsModel.create(row);

  return accountsModel.getById(Number(insertedId));
}

function get(payload) {
  const id = extractId(payload);
  return accountsModel.getById(id);
}

function list(payload) {
  const { where, options } = extractListPayload(payload);
  return accountsModel.list(where, options);
}

function listActive(payload) {
  const options = extractOptionsPayload(payload);
  return accountsModel.listActive(options);
}

function update(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const id = extractId({ id: body.id });
  const changes = normalizeAccountChanges(body.changes, 'changes', { partial: true });

  const changed = accountsModel.updateById(id, {
    ...changes,
    updated_at: nowUnixTimestampMilliseconds(),
  });

  return {
    changed,
    row: accountsModel.getById(id),
  };
}

function remove(payload) {
  const id = extractId(payload);
  const changed = accountsModel.deleteById(id);

  return { changed };
}

module.exports = {
  create,
  get,
  list,
  listActive,
  remove,
  update,
};
