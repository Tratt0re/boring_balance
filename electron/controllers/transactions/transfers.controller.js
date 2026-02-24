const { transfersModel } = require('../../models');
const {
  assertAllowedKeys,
  ensurePlainObject,
  extractString,
  normalizeAmountToCents,
  normalizeFiltersListPayload,
  normalizeInternalPlanItemId,
  normalizeOptionalAmountFilterToCents,
  normalizeOptionalBooleanFlag,
  normalizeOptionalIdArray,
  normalizeOptionalString,
  normalizeUnixTimestampMilliseconds,
  nowUnixTimestampMilliseconds,
  normalizePositiveInteger,
  pickDefined,
} = require('../utils');

const LIST_PAYLOAD_FIELDS = new Set(['filters', 'page', 'page_size']);
const LIST_FILTER_FIELDS = new Set(['date_from', 'date_to', 'amount_from', 'amount_to', 'accounts', 'settled']);
const CREATE_FIELDS = new Set(['occurred_at', 'from_account_id', 'to_account_id', 'amount', 'description', 'settled']);
const UPDATE_FIELDS = new Set([
  'transfer_id',
  'occurred_at',
  'from_account_id',
  'to_account_id',
  'amount',
  'description',
  'settled',
]);
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 250;
const DESCRIPTION_MAX_LENGTH = 75;

function normalizeListFilters(payload) {
  const { filters, pagination } = normalizeFiltersListPayload(payload, {
    allowedPayloadFields: LIST_PAYLOAD_FIELDS,
    allowedFilterFields: LIST_FILTER_FIELDS,
    defaultPage: DEFAULT_PAGE,
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  });

  return {
    filters: pickDefined({
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
      accounts: normalizeOptionalIdArray(filters.accounts, 'payload.filters.accounts'),
      settled: normalizeOptionalBooleanFlag(filters.settled, 'payload.filters.settled'),
    }),
    pagination,
  };
}

function normalizeCreatePayload(payload, options = {}) {
  const body = ensurePlainObject(payload, 'payload');
  assertAllowedKeys(body, CREATE_FIELDS, 'payload');

  const occurredAt = normalizeUnixTimestampMilliseconds(body.occurred_at, 'payload.occurred_at');
  const fromAccountId = normalizePositiveInteger(body.from_account_id, 'payload.from_account_id');
  const toAccountId = normalizePositiveInteger(body.to_account_id, 'payload.to_account_id');
  const amountCents = normalizeAmountToCents(body.amount, 'payload.amount');
  const description = normalizeOptionalString(body.description, 'payload.description', {
    allowEmpty: true,
    maxLength: DESCRIPTION_MAX_LENGTH,
  });
  const settled = normalizeOptionalBooleanFlag(body.settled, 'payload.settled');

  if (amountCents <= 0) {
    throw new Error('payload.amount must be a positive number.');
  }

  if (fromAccountId === toAccountId) {
    throw new Error('payload.from_account_id and payload.to_account_id must be different.');
  }

  const planItemId = normalizeInternalPlanItemId(options);

  return {
    occurred_at: occurredAt,
    from_account_id: fromAccountId,
    to_account_id: toAccountId,
    amount_cents: amountCents,
    description: description ?? null,
    settled: settled ?? 1,
    created_at: nowUnixTimestampMilliseconds(),
    ...(planItemId === undefined ? {} : { plan_item_id: planItemId }),
  };
}

function normalizeUpdatePayload(payload, options = {}) {
  const body = ensurePlainObject(payload, 'payload');
  assertAllowedKeys(body, UPDATE_FIELDS, 'payload');

  const transferId = extractString({ transfer_id: body.transfer_id }, 'transfer_id');
  const occurredAt = normalizeUnixTimestampMilliseconds(body.occurred_at, 'payload.occurred_at');
  const fromAccountId = normalizePositiveInteger(body.from_account_id, 'payload.from_account_id');
  const toAccountId = normalizePositiveInteger(body.to_account_id, 'payload.to_account_id');
  const amountCents = normalizeAmountToCents(body.amount, 'payload.amount');
  const description = normalizeOptionalString(body.description, 'payload.description', {
    allowEmpty: true,
    maxLength: DESCRIPTION_MAX_LENGTH,
  });
  const settled = normalizeOptionalBooleanFlag(body.settled, 'payload.settled');

  if (amountCents <= 0) {
    throw new Error('payload.amount must be a positive number.');
  }

  if (fromAccountId === toAccountId) {
    throw new Error('payload.from_account_id and payload.to_account_id must be different.');
  }

  const planItemId = normalizeInternalPlanItemId(options);

  return {
    transfer_id: transferId,
    occurred_at: occurredAt,
    from_account_id: fromAccountId,
    to_account_id: toAccountId,
    amount_cents: amountCents,
    description: description ?? null,
    ...(settled === undefined ? {} : { settled }),
    ...(planItemId === undefined ? {} : { plan_item_id: planItemId }),
    updated_at: nowUnixTimestampMilliseconds(),
  };
}

function list(payload) {
  const { filters, pagination } = normalizeListFilters(payload);
  return transfersModel.list(filters, pagination);
}

function create(payload, options = {}) {
  const transferPayload = normalizeCreatePayload(payload, options);
  return transfersModel.create(transferPayload);
}

function update(payload, options = {}) {
  const transferPayload = normalizeUpdatePayload(payload, options);
  return transfersModel.update(transferPayload);
}

function remove(payload) {
  const transferId = extractString(payload, 'transfer_id');
  return transfersModel.remove({ transfer_id: transferId });
}

module.exports = {
  list,
  create,
  update,
  remove,
};
