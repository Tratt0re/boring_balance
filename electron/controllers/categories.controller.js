const { categoriesModel } = require('../models');
const { TRANSFER_CATEGORY_ID } = require('../models/transactions/constants');
const { ALLOWED_CATEGORY_TYPES: ALLOWED_TYPES } = require('./constants');
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
  normalizeOptionalInteger,
  normalizeOptionalString,
  normalizeWhereOptionsListPayload,
  pickDefined,
  requireString,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} = require('./utils');

const CATEGORY_FIELDS = new Set([
  'name',
  'parent_id',
  'description',
  'color_key',
  'icon',
  'type',
  'locked',
  'archived',
]);
const LIST_PAYLOAD_FIELDS = new Set(['where', 'options', 'page', 'page_size', 'all']);
const DESCRIPTION_MAX_LENGTH = 50;

function mergeSystemCategoryFilter(where = {}) {
  const nextWhere = { ...where };
  const existingIdFilter = nextWhere.id;

  if (existingIdFilter === undefined) {
    nextWhere.id = { ne: TRANSFER_CATEGORY_ID };
    return nextWhere;
  }

  if (Array.isArray(existingIdFilter)) {
    nextWhere.id = {
      in: existingIdFilter,
      ne: TRANSFER_CATEGORY_ID,
    };
    return nextWhere;
  }

  if (existingIdFilter && typeof existingIdFilter === 'object') {
    nextWhere.id = {
      ...existingIdFilter,
      ne: TRANSFER_CATEGORY_ID,
    };
    return nextWhere;
  }

  nextWhere.id = {
    eq: existingIdFilter,
    ne: TRANSFER_CATEGORY_ID,
  };
  return nextWhere;
}

function normalizeCategoryChanges(value, label, options = {}) {
  const changesInput = options.partial ? ensureNonEmptyObject(value, label) : ensurePlainObject(value, label);
  assertAllowedKeys(changesInput, CATEGORY_FIELDS, label);

  const changes = pickDefined({
    name:
      changesInput.name === undefined
        ? undefined
        : requireString(changesInput.name, `${label}.name`, { allowEmpty: false }),
    parent_id: normalizeOptionalInteger(changesInput.parent_id, `${label}.parent_id`),
    description: normalizeOptionalString(changesInput.description, `${label}.description`, {
      maxLength: DESCRIPTION_MAX_LENGTH,
    }),
    color_key: normalizeOptionalString(changesInput.color_key, `${label}.color_key`),
    icon: normalizeOptionalString(changesInput.icon, `${label}.icon`),
    type:
      changesInput.type === undefined ? undefined : normalizeEnum(changesInput.type, `${label}.type`, ALLOWED_TYPES),
    locked: normalizeOptionalBooleanFlag(changesInput.locked, `${label}.locked`),
    archived: normalizeOptionalBooleanFlag(changesInput.archived, `${label}.archived`),
  });

  if (!options.partial) {
    if (changes.name === undefined) {
      throw new Error('payload.name is required.');
    }

    if (changes.type === undefined) {
      throw new Error('payload.type is required.');
    }
  }

  ensureHasKeys(changes, label);
  return changes;
}

function create(payload) {
  const row = {
    ...normalizeCategoryChanges(payload, 'payload'),
    created_at: nowUnixTimestampMilliseconds(),
  };
  const insertedId = categoriesModel.create(row);

  return categoriesModel.getById(Number(insertedId));
}

function get(payload) {
  const id = extractId(payload);
  return categoriesModel.getById(id);
}

function list(payload) {
  const { where, options, pagination, all } = normalizeWhereOptionsListPayload(payload, {
    allowedPayloadFields: LIST_PAYLOAD_FIELDS,
    defaultPage: DEFAULT_PAGE,
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  });
  const effectiveWhere = mergeSystemCategoryFilter(where);
  const { limit: _ignoredLimit, offset: _ignoredOffset, ...listOptions } = options;

  return executeWhereOptionsListQuery(categoriesModel, { where: effectiveWhere, listOptions, pagination, all });
}

function update(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const id = extractId({ id: body.id });
  const changes = normalizeCategoryChanges(body.changes, 'changes', { partial: true });
  const existingCategory = categoriesModel.getById(id);

  if (existingCategory?.locked === 1) {
    throw new Error('Locked categories cannot be updated.');
  }

  const changed = categoriesModel.updateById(id, {
    ...changes,
    updated_at: nowUnixTimestampMilliseconds(),
  });

  return {
    changed,
    row: categoriesModel.getById(id),
  };
}

function remove(payload) {
  const id = extractId(payload);
  const existingCategory = categoriesModel.getById(id);

  if (existingCategory?.locked === 1) {
    throw new Error('Locked categories cannot be deleted.');
  }

  const changed = categoriesModel.deleteById(id);

  return { changed };
}

module.exports = {
  create,
  get,
  list,
  remove,
  update,
};
