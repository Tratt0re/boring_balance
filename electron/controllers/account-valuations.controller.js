const { accountValuationsModel } = require('../models');
const {
  assertAllowedKeys,
  ensureNonEmptyObject,
  ensurePlainObject,
  extractId,
  nowUnixTimestampMilliseconds,
  normalizeOptionalString,
  normalizeWhereOptionsListPayload,
  pickDefined,
  normalizePositiveInteger,
  normalizeNonNegativeInteger,
  normalizeUnixTimestampMilliseconds,
  resolvePaginationWindow,
} = require('./utils');

const ALLOWED_SOURCES = new Set(['manual', 'api', 'import']);
const VALUATION_FIELDS = new Set(['valued_at', 'value_cents', 'source']);
const LIST_PAYLOAD_FIELDS = new Set(['where', 'options', 'page', 'page_size', 'all']);
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 250;

function normalizeSource(value, label) {
  const normalized = normalizeOptionalString(value, label);
  if (normalized !== undefined && normalized !== null && !ALLOWED_SOURCES.has(normalized)) {
    throw new Error(`${label} must be one of: manual, api, import.`);
  }
  return normalized;
}

function create(payload) {
  const body = ensurePlainObject(payload, 'payload');

  const account_id = normalizePositiveInteger(body.account_id, 'payload.account_id');
  const valued_at = normalizeUnixTimestampMilliseconds(body.valued_at, 'payload.valued_at');
  const value_cents = normalizeNonNegativeInteger(body.value_cents, 'payload.value_cents');
  const source = normalizeSource(body.source, 'payload.source') ?? 'manual';

  const row = {
    account_id,
    valued_at,
    value_cents,
    source,
    created_at: nowUnixTimestampMilliseconds(),
  };

  const insertedId = accountValuationsModel.create(row);
  return accountValuationsModel.getById(Number(insertedId));
}

function get(payload) {
  const id = extractId(payload);
  return accountValuationsModel.getById(id);
}

function list(payload) {
  const { where, options, pagination, all } = normalizeWhereOptionsListPayload(payload, {
    allowedPayloadFields: LIST_PAYLOAD_FIELDS,
    defaultPage: DEFAULT_PAGE,
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  });
  const listOptions = {
    ...options,
    orderBy: 'valued_at',
    orderDirection: 'DESC',
  };
  const { limit: _l, offset: _o, ...countOptions } = listOptions;
  void countOptions;

  const total = accountValuationsModel.count(where);

  if (all) {
    const rows = accountValuationsModel.list(where, listOptions);
    const pageSize = rows.length > 0 ? rows.length : DEFAULT_PAGE_SIZE;
    return { rows, total, page: DEFAULT_PAGE, page_size: pageSize };
  }

  const { page, offset } = resolvePaginationWindow(total, pagination, { defaultPage: DEFAULT_PAGE });
  const rows = accountValuationsModel.list(where, {
    ...listOptions,
    limit: pagination.page_size,
    offset,
  });

  return { rows, total, page, page_size: pagination.page_size };
}

function update(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const id = extractId({ id: body.id });
  const changesInput = ensureNonEmptyObject(body.changes, 'changes');
  assertAllowedKeys(changesInput, VALUATION_FIELDS, 'changes');

  const changes = pickDefined({
    valued_at:
      changesInput.valued_at === undefined
        ? undefined
        : normalizeUnixTimestampMilliseconds(changesInput.valued_at, 'changes.valued_at'),
    value_cents:
      changesInput.value_cents === undefined
        ? undefined
        : normalizeNonNegativeInteger(changesInput.value_cents, 'changes.value_cents'),
    source: normalizeSource(changesInput.source, 'changes.source'),
  });

  const changed = accountValuationsModel.updateById(id, {
    ...changes,
    updated_at: nowUnixTimestampMilliseconds(),
  });

  return { changed, row: accountValuationsModel.getById(id) };
}

function remove(payload) {
  const id = extractId(payload);
  const changed = accountValuationsModel.deleteById(id);
  return { changed };
}

function getLatestByAccount(payload) {
  const body = ensurePlainObject(payload, 'payload');
  const account_id = normalizePositiveInteger(body.account_id, 'payload.account_id');
  return accountValuationsModel.getLatestByAccount(account_id);
}

module.exports = {
  create,
  get,
  list,
  update,
  remove,
  getLatestByAccount,
};
