const { transfersModel } = require('../../models');
const {
  assertAllowedKeys,
  ensurePlainObject,
  extractString,
  normalizeAmountToCents,
  normalizeUnixTimestampMilliseconds,
  nowUnixTimestampMilliseconds,
  normalizePositiveInteger,
  pickDefined,
} = require('../utils');

const LIST_PAYLOAD_FIELDS = new Set(['filters']);
const LIST_FILTER_FIELDS = new Set(['date_from', 'date_to', 'accounts']);
const CREATE_FIELDS = new Set(['occurred_at', 'from_account_id', 'to_account_id', 'amount']);
const UPDATE_FIELDS = new Set(['transfer_id', 'occurred_at', 'from_account_id', 'to_account_id', 'amount']);

function normalizeOptionalIdArray(value, label) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((entry, index) => normalizePositiveInteger(entry, `${label}[${index}]`));
}

function normalizeListFilters(payload) {
  if (payload === undefined || payload === null) {
    return {};
  }

  const body = ensurePlainObject(payload, 'payload');
  assertAllowedKeys(body, LIST_PAYLOAD_FIELDS, 'payload');
  const filters = body.filters === undefined ? {} : ensurePlainObject(body.filters, 'payload.filters');
  assertAllowedKeys(filters, LIST_FILTER_FIELDS, 'payload.filters');

  return pickDefined({
    date_from:
      filters.date_from === undefined
        ? undefined
        : normalizeUnixTimestampMilliseconds(filters.date_from, 'payload.filters.date_from'),
    date_to:
      filters.date_to === undefined ? undefined : normalizeUnixTimestampMilliseconds(filters.date_to, 'payload.filters.date_to'),
    accounts: normalizeOptionalIdArray(filters.accounts, 'payload.filters.accounts'),
  });
}

function normalizeCreatePayload(payload) {
  const body = ensurePlainObject(payload, 'payload');
  assertAllowedKeys(body, CREATE_FIELDS, 'payload');

  const occurredAt = normalizeUnixTimestampMilliseconds(body.occurred_at, 'payload.occurred_at');
  const fromAccountId = normalizePositiveInteger(body.from_account_id, 'payload.from_account_id');
  const toAccountId = normalizePositiveInteger(body.to_account_id, 'payload.to_account_id');
  const amountCents = normalizeAmountToCents(body.amount, 'payload.amount');

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
    updated_at: nowUnixTimestampMilliseconds(),
  };
}

function list(payload) {
  const filters = normalizeListFilters(payload);
  return transfersModel.list(filters);
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
