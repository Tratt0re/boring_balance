const { categoriesModel } = require('../models');
const {
  assertAllowedKeys,
  ensureHasKeys,
  ensureNonEmptyObject,
  ensurePlainObject,
  extractId,
  normalizeBooleanFlag,
  nowUnixTimestampMilliseconds,
  normalizeOptionalBooleanFlag,
  normalizePositiveInteger,
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
const LIST_PAYLOAD_FIELDS = new Set(['where', 'options', 'page', 'page_size', 'all']);
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 250;

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

function normalizeListPayload(payload) {
  if (payload === undefined || payload === null) {
    return {
      where: {},
      options: {},
      pagination: {
        page: DEFAULT_PAGE,
        page_size: DEFAULT_PAGE_SIZE,
      },
      all: false,
    };
  }

  const body = ensurePlainObject(payload, 'payload');
  assertAllowedKeys(body, LIST_PAYLOAD_FIELDS, 'payload');

  const where = body.where ?? {};
  const options = body.options ?? {};
  ensurePlainObject(where, 'payload.where');
  ensurePlainObject(options, 'payload.options');

  const all = body.all === undefined ? false : normalizeBooleanFlag(body.all, 'payload.all') === 1;
  if (all) {
    return {
      where,
      options,
      pagination: {
        page: DEFAULT_PAGE,
        page_size: DEFAULT_PAGE_SIZE,
      },
      all: true,
    };
  }

  const page = body.page === undefined ? DEFAULT_PAGE : normalizePositiveInteger(body.page, 'payload.page');
  const pageSize =
    body.page_size === undefined ? DEFAULT_PAGE_SIZE : normalizePositiveInteger(body.page_size, 'payload.page_size');

  if (pageSize > MAX_PAGE_SIZE) {
    throw new Error(`payload.page_size cannot be greater than ${MAX_PAGE_SIZE}.`);
  }

  return {
    where,
    options,
    pagination: {
      page,
      page_size: pageSize,
    },
    all: false,
  };
}

function list(payload) {
  const { where, options, pagination, all } = normalizeListPayload(payload);
  const { limit: _ignoredLimit, offset: _ignoredOffset, ...listOptions } = options;
  const total = categoriesModel.count(where);

  if (all) {
    const rows = categoriesModel.list(where, listOptions);
    const pageSize = rows.length > 0 ? rows.length : DEFAULT_PAGE_SIZE;

    return {
      rows,
      total,
      page: DEFAULT_PAGE,
      page_size: pageSize,
    };
  }

  const totalPages =
    total === 0 ? DEFAULT_PAGE : Math.max(DEFAULT_PAGE, Math.ceil(total / pagination.page_size));
  const page = Math.min(pagination.page, totalPages);
  const offset = (page - 1) * pagination.page_size;
  const rows = categoriesModel.list(where, {
    ...listOptions,
    limit: pagination.page_size,
    offset,
  });

  return {
    rows,
    total,
    page,
    page_size: pagination.page_size,
  };
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
