const { transactionsModel } = require('../models');
const {
  assertAllowedKeys,
  ensureHasKeys,
  ensureNonEmptyObject,
  ensurePlainObject,
  extractId,
  extractListPayload,
  extractOptionsPayload,
  normalizeAmountToCents,
  normalizeUnixTimestampMilliseconds,
  nowUnixTimestampMilliseconds,
  normalizeOptionalBooleanFlag,
  normalizeOptionalString,
  normalizePositiveInteger,
  pickDefined,
  requireString,
} = require('./utils');

const TRANSACTION_FIELDS = new Set([
  'occurred_at',
  'account_id',
  'category_id',
  'amount_cents',
  'description',
  'notes',
  'transfer_id',
  'settled',
]);

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
      changesInput.amount_cents === undefined
        ? undefined
        : normalizeAmountToCents(changesInput.amount_cents, `${label}.amount_cents`),
    description: normalizeOptionalString(changesInput.description, `${label}.description`),
    notes: normalizeOptionalString(changesInput.notes, `${label}.notes`),
    transfer_id: normalizeOptionalString(changesInput.transfer_id, `${label}.transfer_id`),
    settled: normalizeOptionalBooleanFlag(changesInput.settled, `${label}.settled`),
  });

  if (!options.partial) {
    const requiredFields = ['occurred_at', 'account_id', 'category_id', 'amount_cents'];

    for (const requiredField of requiredFields) {
      if (changes[requiredField] === undefined) {
        throw new Error(`payload.${requiredField} is required.`);
      }
    }
  }

  ensureHasKeys(changes, label);
  return changes;
}

function normalizeDateRangeFilters(payload) {
  if (payload === undefined || payload === null) {
    return {};
  }

  const body = ensurePlainObject(payload, 'payload');

  return pickDefined({
    from:
      body.from === undefined
        ? undefined
        : normalizeUnixTimestampMilliseconds(body.from, 'from'),
    to: body.to === undefined ? undefined : normalizeUnixTimestampMilliseconds(body.to, 'to'),
    accountId:
      body.accountId === undefined
        ? undefined
        : normalizePositiveInteger(body.accountId, 'accountId'),
    categoryId:
      body.categoryId === undefined
        ? undefined
        : normalizePositiveInteger(body.categoryId, 'categoryId'),
    settled: normalizeOptionalBooleanFlag(body.settled, 'settled'),
    transferId:
      body.transferId === undefined
        ? undefined
        : body.transferId === null
          ? null
          : requireString(body.transferId, 'transferId', { allowEmpty: false }),
  });
}

function normalizePaginationOptions(options, label) {
  if (options.page === undefined) {
    throw new Error(`${label}.page is required.`);
  }

  if (options.perPage === undefined) {
    throw new Error(`${label}.perPage is required.`);
  }

  const paginationOptions = {
    page: normalizePositiveInteger(options.page, `${label}.page`),
    perPage: normalizePositiveInteger(options.perPage, `${label}.perPage`),
  };

  if (options.orderBy !== undefined) {
    paginationOptions.orderBy = requireString(options.orderBy, `${label}.orderBy`, { allowEmpty: false });
  }

  if (options.orderDirection !== undefined) {
    paginationOptions.orderDirection = requireString(options.orderDirection, `${label}.orderDirection`, {
      allowEmpty: false,
    }).toUpperCase();
  }

  return paginationOptions;
}

function buildPaginatedTransactionsResponse(paginatedResult, paginationOptions) {
  const totalTransactions = paginatedResult.totalTransactions;

  return {
    transactions: paginatedResult.rows,
    page: paginationOptions.page,
    perPage: paginationOptions.perPage,
    totalPages: totalTransactions === 0 ? 0 : Math.ceil(totalTransactions / paginationOptions.perPage),
    totalTransactions,
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
  const { where, options } = extractListPayload(payload);
  const paginationOptions = normalizePaginationOptions(options, 'payload.options');
  const paginatedResult = transactionsModel.listPaginated(where, paginationOptions);

  return buildPaginatedTransactionsResponse(paginatedResult, paginationOptions);
}

function listByAccount(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const accountId = normalizePositiveInteger(body.account_id, 'account_id');
  const options = extractOptionsPayload({ options: body.options ?? {} });
  const paginationOptions = normalizePaginationOptions(options, 'payload.options');
  const paginatedResult = transactionsModel.listByAccount(accountId, paginationOptions);

  return buildPaginatedTransactionsResponse(paginatedResult, paginationOptions);
}

function listByCategory(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const categoryId = normalizePositiveInteger(body.category_id, 'category_id');
  const options = extractOptionsPayload({ options: body.options ?? {} });
  const paginationOptions = normalizePaginationOptions(options, 'payload.options');
  const paginatedResult = transactionsModel.listByCategory(categoryId, paginationOptions);

  return buildPaginatedTransactionsResponse(paginatedResult, paginationOptions);
}

function listUnsettled(payload) {
  const options = extractOptionsPayload(payload);
  const paginationOptions = normalizePaginationOptions(options, 'options');
  const paginatedResult = transactionsModel.listUnsettled(paginationOptions);

  return buildPaginatedTransactionsResponse(paginatedResult, paginationOptions);
}

function listByDateRange(payload) {
  const body = payload ? ensurePlainObject(payload, 'payload') : {};
  const filters = normalizeDateRangeFilters(body);
  const options = extractOptionsPayload({ options: body.options ?? {} });
  const paginationOptions = normalizePaginationOptions(options, 'payload.options');
  const paginatedResult = transactionsModel.listByDateRange(filters, paginationOptions);

  return buildPaginatedTransactionsResponse(paginatedResult, paginationOptions);
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
  listByAccount,
  listByCategory,
  listByDateRange,
  listUnsettled,
  remove,
  update,
};
