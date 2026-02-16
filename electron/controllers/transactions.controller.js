const { transactionsModel } = require('../models');
const {
  assertAllowedKeys,
  ensureHasKeys,
  ensureNonEmptyObject,
  ensurePlainObject,
  extractId,
  extractString,
  normalizeAmountToCents,
  normalizeUnixTimestampMilliseconds,
  nowUnixTimestampMilliseconds,
  normalizeOptionalBooleanFlag,
  normalizeOptionalString,
  normalizePositiveInteger,
  pickDefined,
} = require('./utils');

const TRANSACTION_FIELDS = new Set([
  'occurred_at',
  'account_id',
  'category_id',
  'amount',
  'description',
  'notes',
  'transfer_id',
  'settled',
]);
const LIST_PAYLOAD_FIELDS = new Set(['filters']);
const LIST_TRANSACTIONS_FILTER_FIELDS = new Set(['date_from', 'date_to', 'categories', 'accounts', 'settled']);
const LIST_TRANSFERS_FILTER_FIELDS = new Set(['date_from', 'date_to', 'accounts']);
const CREATE_TRANSFER_FIELDS = new Set(['occurred_at', 'from_account_id', 'to_account_id', 'amount']);
const UPDATE_TRANSFER_FIELDS = new Set(['transfer_id', 'occurred_at', 'from_account_id', 'to_account_id', 'amount']);

function normalizeTransactionChanges(value, label, options = {}) {
  const changesInput = options.partial ? ensureNonEmptyObject(value, label) : ensurePlainObject(value, label);
  assertAllowedKeys(changesInput, TRANSACTION_FIELDS, label);

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
    notes: normalizeOptionalString(changesInput.notes, `${label}.notes`),
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

function normalizeListTransactionsFilters(payload) {
  if (payload === undefined || payload === null) {
    return {};
  }

  const body = ensurePlainObject(payload, 'payload');
  assertAllowedKeys(body, LIST_PAYLOAD_FIELDS, 'payload');
  const filters = body.filters === undefined ? {} : ensurePlainObject(body.filters, 'payload.filters');
  assertAllowedKeys(filters, LIST_TRANSACTIONS_FILTER_FIELDS, 'payload.filters');

  return pickDefined({
    date_from:
      filters.date_from === undefined
        ? undefined
        : normalizeUnixTimestampMilliseconds(filters.date_from, 'payload.filters.date_from'),
    date_to:
      filters.date_to === undefined ? undefined : normalizeUnixTimestampMilliseconds(filters.date_to, 'payload.filters.date_to'),
    categories: normalizeOptionalIdArray(filters.categories, 'payload.filters.categories'),
    accounts: normalizeOptionalIdArray(filters.accounts, 'payload.filters.accounts'),
    settled: normalizeOptionalBooleanFlag(filters.settled, 'payload.filters.settled'),
  });
}

function normalizeListTransfersFilters(payload) {
  if (payload === undefined || payload === null) {
    return {};
  }

  const body = ensurePlainObject(payload, 'payload');
  assertAllowedKeys(body, LIST_PAYLOAD_FIELDS, 'payload');
  const filters = body.filters === undefined ? {} : ensurePlainObject(body.filters, 'payload.filters');
  assertAllowedKeys(filters, LIST_TRANSFERS_FILTER_FIELDS, 'payload.filters');

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

function normalizeCreateTransferPayload(payload) {
  const body = ensurePlainObject(payload, 'payload');
  assertAllowedKeys(body, CREATE_TRANSFER_FIELDS, 'payload');

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

function normalizeUpdateTransferPayload(payload) {
  const body = ensurePlainObject(payload, 'payload');
  assertAllowedKeys(body, UPDATE_TRANSFER_FIELDS, 'payload');

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

function listTransactions(payload) {
  const filters = normalizeListTransactionsFilters(payload);
  return transactionsModel.listTransactions(filters);
}

function listTransfers(payload) {
  const filters = normalizeListTransfersFilters(payload);
  return transactionsModel.listTransfers(filters);
}

function createTransfer(payload) {
  const transferPayload = normalizeCreateTransferPayload(payload);
  return transactionsModel.createTransfer(transferPayload);
}

function updateTransfer(payload) {
  const transferPayload = normalizeUpdateTransferPayload(payload);
  return transactionsModel.updateTransfer(transferPayload);
}

function deleteTransfer(payload) {
  const transferId = extractString(payload, 'transfer_id');
  return transactionsModel.deleteTransfer({ transfer_id: transferId });
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
  createTransfer,
  updateTransfer,
  deleteTransfer,
  get,
  listTransactions,
  listTransfers,
  remove,
  update,
};
