const { accountsModel } = require('../models');
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
  normalizeOptionalString,
  pickDefined,
  requireString,
} = require('./utils');

const ALLOWED_ACCOUNT_TYPES = new Set(['cash', 'bank', 'savings', 'brokerage', 'crypto', 'credit']);
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
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 250;
const DESCRIPTION_MAX_LENGTH = 50;

function normalizeAccountType(value, label) {
  const normalizedType = requireString(value, label, { allowEmpty: false });
  if (!ALLOWED_ACCOUNT_TYPES.has(normalizedType)) {
    throw new Error(`${label} must be one of: cash, bank, savings, brokerage, crypto, credit.`);
  }

  return normalizedType;
}

function normalizeAccountChanges(value, label, options = {}) {
  const changesInput = options.partial ? ensureNonEmptyObject(value, label) : ensurePlainObject(value, label);
  assertAllowedKeys(changesInput, ACCOUNT_FIELDS, label);

  const changes = pickDefined({
    name:
      changesInput.name === undefined
        ? undefined
        : requireString(changesInput.name, `${label}.name`, { allowEmpty: false }),
    type:
      changesInput.type === undefined ? undefined : normalizeAccountType(changesInput.type, `${label}.type`),
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
  const total = accountsModel.count(where);

  if (all) {
    const rows = accountsModel.list(where, listOptions);
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
  const rows = accountsModel.list(where, {
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
