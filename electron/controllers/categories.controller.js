const { categoriesModel } = require('../models');
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
  normalizeOptionalInteger,
  normalizeOptionalString,
  pickDefined,
  requireString,
} = require('./utils');

const ALLOWED_TYPES = new Set(['income', 'expense', 'exclude']);
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

function normalizeCategoryType(value, label) {
  const normalizedType = requireString(value, label, { allowEmpty: false });
  if (!ALLOWED_TYPES.has(normalizedType)) {
    throw new Error(`${label} must be one of: income, expense, exclude.`);
  }

  return normalizedType;
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
    description: normalizeOptionalString(changesInput.description, `${label}.description`),
    color_key: normalizeOptionalString(changesInput.color_key, `${label}.color_key`),
    icon: normalizeOptionalString(changesInput.icon, `${label}.icon`),
    type:
      changesInput.type === undefined ? undefined : normalizeCategoryType(changesInput.type, `${label}.type`),
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
  const { where, options } = extractListPayload(payload);
  return categoriesModel.list(where, options);
}

function listByType(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const type = normalizeCategoryType(body.type, 'type');
  const options = extractOptionsPayload({ options: body.options ?? {} });

  return categoriesModel.listByType(type, options);
}

function listByParent(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const options = extractOptionsPayload({ options: body.options ?? {} });

  if (body.parent_id === null) {
    return categoriesModel.listRoot(options);
  }

  const parentId = extractId({ id: body.parent_id });
  return categoriesModel.listByParent(parentId, options);
}

function listRoot(payload) {
  const options = extractOptionsPayload(payload);
  return categoriesModel.listRoot(options);
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
  listByParent,
  listByType,
  listRoot,
  remove,
  update,
};
