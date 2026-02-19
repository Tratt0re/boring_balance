const { transactionsModel } = require('../../models');
const {
  assertAllowedKeys,
  ensureHasKeys,
  ensureNonEmptyObject,
  ensurePlainObject,
  extractId,
  normalizeAmountToCents,
  normalizeUnixTimestampMilliseconds,
  nowUnixTimestampMilliseconds,
  normalizeOptionalBooleanFlag,
  normalizeOptionalString,
  normalizePositiveInteger,
  pickDefined,
  requireString,
} = require('../utils');

const TRANSACTION_FIELDS = new Set([
  'occurred_at',
  'account_id',
  'category_id',
  'amount',
  'description',
  'tags',
  'transfer_id',
  'settled',
]);
const LIST_PAYLOAD_FIELDS = new Set(['filters', 'page', 'page_size']);
const LIST_FILTER_FIELDS = new Set([
  'date_from',
  'date_to',
  'amount_from',
  'amount_to',
  'categories',
  'accounts',
  'settled',
]);
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 250;

function normalizeOptionalTags(value, label) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((entry, index) =>
    requireString(entry, `${label}[${index}]`, { allowEmpty: false }),
  );
}

function normalizeTransactionChanges(value, label, options = {}) {
  const changesInput = options.partial ? ensureNonEmptyObject(value, label) : ensurePlainObject(value, label);
  assertAllowedKeys(changesInput, TRANSACTION_FIELDS, label);
  const normalizedTags = normalizeOptionalTags(changesInput.tags, `${label}.tags`);

  const changes = pickDefined({
    occurred_at:
      changesInput.occurred_at === undefined
        ? undefined
        : normalizeUnixTimestampMilliseconds(changesInput.occurred_at, `${label}.occurred_at`),
    account_id:
      changesInput.account_id === undefined
        ? undefined
        : normalizePositiveInteger(changesInput.account_id, `${label}.account_id`),
    category_id:
      changesInput.category_id === undefined
        ? undefined
        : normalizePositiveInteger(changesInput.category_id, `${label}.category_id`),
    amount_cents:
      changesInput.amount === undefined
        ? undefined
        : normalizeAmountToCents(changesInput.amount, `${label}.amount`),
    description: normalizeOptionalString(changesInput.description, `${label}.description`),
    tags: normalizedTags === undefined ? undefined : JSON.stringify(normalizedTags),
    transfer_id: normalizeOptionalString(changesInput.transfer_id, `${label}.transfer_id`),
    settled: normalizeOptionalBooleanFlag(changesInput.settled, `${label}.settled`),
  });

  if (!options.partial) {
    const requiredFields = [
      { changeKey: 'occurred_at', payloadKey: 'occurred_at' },
      { changeKey: 'account_id', payloadKey: 'account_id' },
      { changeKey: 'category_id', payloadKey: 'category_id' },
      { changeKey: 'amount_cents', payloadKey: 'amount' },
    ];

    for (const requiredField of requiredFields) {
      if (changes[requiredField.changeKey] === undefined) {
        throw new Error(`payload.${requiredField.payloadKey} is required.`);
      }
    }
  }

  ensureHasKeys(changes, label);
  return changes;
}

function normalizeOptionalIdArray(value, label) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((entry, index) => normalizePositiveInteger(entry, `${label}[${index}]`));
}

function normalizeOptionalAmountFilterToCents(value, label) {
  if (value === undefined) {
    return undefined;
  }

  let normalizedValue = value;
  if (typeof normalizedValue === 'string') {
    const trimmedValue = normalizedValue.trim();
    if (trimmedValue.length === 0) {
      throw new Error(`${label} cannot be empty.`);
    }

    normalizedValue = Number(trimmedValue);
  }

  return Math.abs(normalizeAmountToCents(normalizedValue, label));
}

function normalizeListFilters(payload) {
  if (payload === undefined || payload === null) {
    return {
      filters: {},
      pagination: {
        page: DEFAULT_PAGE,
        page_size: DEFAULT_PAGE_SIZE,
      },
    };
  }

  const body = ensurePlainObject(payload, 'payload');
  assertAllowedKeys(body, LIST_PAYLOAD_FIELDS, 'payload');
  const filters = body.filters === undefined ? {} : ensurePlainObject(body.filters, 'payload.filters');
  assertAllowedKeys(filters, LIST_FILTER_FIELDS, 'payload.filters');

  const page = body.page === undefined ? DEFAULT_PAGE : normalizePositiveInteger(body.page, 'payload.page');
  const pageSize =
    body.page_size === undefined ? DEFAULT_PAGE_SIZE : normalizePositiveInteger(body.page_size, 'payload.page_size');
  if (pageSize > MAX_PAGE_SIZE) {
    throw new Error(`payload.page_size cannot be greater than ${MAX_PAGE_SIZE}.`);
  }

  return {
    filters: (() => {
      const normalizedFilters = pickDefined({
        date_from:
          filters.date_from === undefined
            ? undefined
            : normalizeUnixTimestampMilliseconds(filters.date_from, 'payload.filters.date_from'),
        date_to:
          filters.date_to === undefined
            ? undefined
            : normalizeUnixTimestampMilliseconds(filters.date_to, 'payload.filters.date_to'),
        amount_from: normalizeOptionalAmountFilterToCents(filters.amount_from, 'payload.filters.amount_from'),
        amount_to: normalizeOptionalAmountFilterToCents(filters.amount_to, 'payload.filters.amount_to'),
        categories: normalizeOptionalIdArray(filters.categories, 'payload.filters.categories'),
        accounts: normalizeOptionalIdArray(filters.accounts, 'payload.filters.accounts'),
        settled: normalizeOptionalBooleanFlag(filters.settled, 'payload.filters.settled'),
      });

      return normalizedFilters;
    })(),
    pagination: {
      page,
      page_size: pageSize,
    },
  };
}

function create(payload) {
  const row = {
    ...normalizeTransactionChanges(payload, 'payload'),
    created_at: nowUnixTimestampMilliseconds(),
  };
  const insertedId = transactionsModel.create(row);

  return transactionsModel.getById(Number(insertedId));
}

function get(payload) {
  const id = extractId(payload);
  return transactionsModel.getById(id);
}

function list(payload) {
  const { filters, pagination } = normalizeListFilters(payload);
  return transactionsModel.list(filters, pagination);
}

function update(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const id = extractId({ id: body.id });
  const changes = normalizeTransactionChanges(body.changes, 'changes', { partial: true });

  const changed = transactionsModel.updateById(id, {
    ...changes,
    updated_at: nowUnixTimestampMilliseconds(),
  });

  return {
    changed,
    row: transactionsModel.getById(id),
  };
}

function remove(payload) {
  const id = extractId(payload);
  const changed = transactionsModel.deleteById(id);

  return { changed };
}

module.exports = {
  create,
  get,
  list,
  remove,
  update,
};
