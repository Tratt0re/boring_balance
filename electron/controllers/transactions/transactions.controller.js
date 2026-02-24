const { transactionsModel } = require('../../models');
const {
  assertAllowedKeys,
  ensureHasKeys,
  ensureNonEmptyObject,
  ensurePlainObject,
  extractId,
  normalizeAmountToCents,
  normalizeFiltersListPayload,
  normalizeInternalPlanItemId,
  normalizeUnixTimestampMilliseconds,
  nowUnixTimestampMilliseconds,
  normalizeOptionalAmountFilterToCents,
  normalizeOptionalBooleanFlag,
  normalizeOptionalEnumArray,
  normalizeOptionalIdArray,
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
  'category_types',
  'categories',
  'accounts',
  'settled',
]);
const ALLOWED_CATEGORY_TYPES = new Set(['income', 'expense', 'exclude']);
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 250;
const DESCRIPTION_MAX_LENGTH = 75;

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
    description: normalizeOptionalString(changesInput.description, `${label}.description`, {
      allowEmpty: true,
      maxLength: DESCRIPTION_MAX_LENGTH,
    }),
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

function normalizeListFilters(payload) {
  const { filters, pagination } = normalizeFiltersListPayload(payload, {
    allowedPayloadFields: LIST_PAYLOAD_FIELDS,
    allowedFilterFields: LIST_FILTER_FIELDS,
    defaultPage: DEFAULT_PAGE,
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  });

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
        category_types: normalizeOptionalEnumArray(
          filters.category_types,
          'payload.filters.category_types',
          ALLOWED_CATEGORY_TYPES,
        ),
        categories: normalizeOptionalIdArray(filters.categories, 'payload.filters.categories'),
        accounts: normalizeOptionalIdArray(filters.accounts, 'payload.filters.accounts'),
        settled: normalizeOptionalBooleanFlag(filters.settled, 'payload.filters.settled'),
      });

      return normalizedFilters;
    })(),
    pagination,
  };
}

function create(payload, options = {}) {
  const planItemId = normalizeInternalPlanItemId(options);
  const row = {
    ...normalizeTransactionChanges(payload, 'payload'),
    created_at: nowUnixTimestampMilliseconds(),
    ...(planItemId === undefined ? {} : { plan_item_id: planItemId }),
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

function update(payload, options = {}) {
  const body = ensurePlainObject(payload, 'payload');
  const id = extractId({ id: body.id });
  const changes = normalizeTransactionChanges(body.changes, 'changes', { partial: true });
  const planItemId = normalizeInternalPlanItemId(options);

  const changed = transactionsModel.updateById(id, {
    ...changes,
    updated_at: nowUnixTimestampMilliseconds(),
    ...(planItemId === undefined ? {} : { plan_item_id: planItemId }),
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
