const { accountsModel } = require('../models');
const { ALLOWED_ACCOUNT_TYPES } = require('./constants');
const {
  assertAllowedKeys,
  ensureHasKeys,
  ensureNonEmptyObject,
  ensurePlainObject,
  executeWhereOptionsListQuery,
  extractId,
  nowUnixTimestampMilliseconds,
  normalizeEnum,
  normalizeOptionalBooleanFlag,
  normalizeOptionalString,
  normalizeWhereOptionsListPayload,
  pickDefined,
  requireString,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} = require('./utils');

const ACCOUNT_FIELDS = new Set([
  'name',
  'type',
  'description',
  'color_key',
  'icon',
  'locked',
  'archived',
]);
const LIST_PAYLOAD_FIELDS = new Set(['where', 'options', 'page', 'page_size', 'all']);
const DESCRIPTION_MAX_LENGTH = 50;

function normalizeAccountChanges(value, label, options = {}) {
  const changesInput = options.partial ? ensureNonEmptyObject(value, label) : ensurePlainObject(value, label);
  assertAllowedKeys(changesInput, ACCOUNT_FIELDS, label);

  const changes = pickDefined({
    name:
      changesInput.name === undefined
        ? undefined
        : requireString(changesInput.name, `${label}.name`, { allowEmpty: false }),
    type:
      changesInput.type === undefined ? undefined : normalizeEnum(changesInput.type, `${label}.type`, ALLOWED_ACCOUNT_TYPES),
    description: normalizeOptionalString(changesInput.description, `${label}.description`, {
      maxLength: DESCRIPTION_MAX_LENGTH,
    }),
    color_key: normalizeOptionalString(changesInput.color_key, `${label}.color_key`),
    icon: normalizeOptionalString(changesInput.icon, `${label}.icon`),
    locked: normalizeOptionalBooleanFlag(changesInput.locked, `${label}.locked`),
    archived: normalizeOptionalBooleanFlag(changesInput.archived, `${label}.archived`),
  });

  if (!options.partial) {
    if (changes.name === undefined) {
      throw new Error(`${label}.name is required.`);
    }

    if (changes.type === undefined) {
      throw new Error(`${label}.type is required.`);
    }
  }

  ensureHasKeys(changes, label);
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
  const { where, options, pagination, all } = normalizeWhereOptionsListPayload(payload, {
    allowedPayloadFields: LIST_PAYLOAD_FIELDS,
    defaultPage: DEFAULT_PAGE,
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  });
  const { limit: _ignoredLimit, offset: _ignoredOffset, ...listOptions } = options;

  return executeWhereOptionsListQuery(accountsModel, { where, listOptions, pagination, all });
}

function update(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const id = extractId({ id: body.id });
  const changes = normalizeAccountChanges(body.changes, 'changes', { partial: true });
  const existingAccount = accountsModel.getById(id);

  if (existingAccount?.locked === 1) {
    throw new Error('Locked accounts cannot be updated.');
  }

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
  const existingAccount = accountsModel.getById(id);

  if (existingAccount?.locked === 1) {
    throw new Error('Locked accounts cannot be deleted.');
  }

  const changed = accountsModel.deleteById(id);

  return { changed };
}

module.exports = {
  create,
  get,
  list,
  remove,
  update,
};
