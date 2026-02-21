const { transfersModel } = require('../../models');
const {
  assertAllowedKeys,
  ensurePlainObject,
  extractString,
  normalizeAmountToCents,
  normalizeOptionalBooleanFlag,
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
const DESCRIPTION_MAX_LENGTH = 50;

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
    pagination: {
      page,
      page_size: pageSize,
    },
  };
}

function normalizeCreatePayload(payload) {
  const body = ensurePlainObject(payload, 'payload');
  assertAllowedKeys(body, CREATE_FIELDS, 'payload');

  const occurredAt = normalizeUnixTimestampMilliseconds(body.occurred_at, 'payload.occurred_at');
  const fromAccountId = normalizePositiveInteger(body.from_account_id, 'payload.from_account_id');
  const toAccountId = normalizePositiveInteger(body.to_account_id, 'payload.to_account_id');
  const amountCents = normalizeAmountToCents(body.amount, 'payload.amount');
  const description = normalizeOptionalString(body.description, 'payload.description', {
    maxLength: DESCRIPTION_MAX_LENGTH,
  });
  const settled = normalizeOptionalBooleanFlag(body.settled, 'payload.settled');

  if (amountCents <= 0) {
    throw new Error('payload.amount must be a positive number.');
  }

  if (fromAccountId === toAccountId) {
    throw new Error('payload.from_account_id and payload.to_account_id must be different.');
  }

  return {
    occurred_at: occurredAt,
    from_account_id: fromAccountId,
    to_account_id: toAccountId,
    amount_cents: amountCents,
    description: description ?? null,
    settled: settled ?? 1,
    created_at: nowUnixTimestampMilliseconds(),
  };
}

function normalizeUpdatePayload(payload) {
  const body = ensurePlainObject(payload, 'payload');
  assertAllowedKeys(body, UPDATE_FIELDS, 'payload');

  const transferId = extractString({ transfer_id: body.transfer_id }, 'transfer_id');
  const occurredAt = normalizeUnixTimestampMilliseconds(body.occurred_at, 'payload.occurred_at');
  const fromAccountId = normalizePositiveInteger(body.from_account_id, 'payload.from_account_id');
  const toAccountId = normalizePositiveInteger(body.to_account_id, 'payload.to_account_id');
  const amountCents = normalizeAmountToCents(body.amount, 'payload.amount');
  const description = normalizeOptionalString(body.description, 'payload.description', {
    maxLength: DESCRIPTION_MAX_LENGTH,
  });
  const settled = normalizeOptionalBooleanFlag(body.settled, 'payload.settled');

  if (amountCents <= 0) {
    throw new Error('payload.amount must be a positive number.');
  }

  if (fromAccountId === toAccountId) {
    throw new Error('payload.from_account_id and payload.to_account_id must be different.');
  }

  return {
    transfer_id: transferId,
    occurred_at: occurredAt,
    from_account_id: fromAccountId,
    to_account_id: toAccountId,
    amount_cents: amountCents,
    description: description ?? null,
    ...(settled === undefined ? {} : { settled }),
    updated_at: nowUnixTimestampMilliseconds(),
  };
}

function list(payload) {
  const { filters, pagination } = normalizeListFilters(payload);
  return transfersModel.list(filters, pagination);
}

function create(payload) {
  const transferPayload = normalizeCreatePayload(payload);
  return transfersModel.create(transferPayload);
}

function update(payload) {
  const transferPayload = normalizeUpdatePayload(payload);
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
