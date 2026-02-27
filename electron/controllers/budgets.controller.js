const { budgetsModel } = require('../models');
const {
  assertAllowedKeys,
  ensureHasKeys,
  ensureNonEmptyObject,
  ensurePlainObject,
  extractId,
  nowUnixTimestampMilliseconds,
  normalizeOptionalBooleanFlag,
  normalizeOptionalString,
  normalizePositiveInteger,
  normalizeWhereOptionsListPayload,
  pickDefined,
  resolvePaginationWindow,
} = require('./utils');

const BUDGET_FIELDS = new Set(['category_id', 'amount_cents', 'include_children', 'description', 'archived']);
const LIST_PAYLOAD_FIELDS = new Set(['where', 'options', 'page', 'page_size', 'all']);
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 250;
const DESCRIPTION_MAX_LENGTH = 75;

function normalizeBudgetChanges(value, label, options = {}) {
  const changesInput = options.partial ? ensureNonEmptyObject(value, label) : ensurePlainObject(value, label);
  assertAllowedKeys(changesInput, BUDGET_FIELDS, label);

  const changes = pickDefined({
    category_id:
      changesInput.category_id === undefined
        ? undefined
        : normalizePositiveInteger(changesInput.category_id, `${label}.category_id`),
    amount_cents:
      changesInput.amount_cents === undefined
        ? undefined
        : normalizePositiveInteger(changesInput.amount_cents, `${label}.amount_cents`),
    include_children: normalizeOptionalBooleanFlag(changesInput.include_children, `${label}.include_children`),
    description: normalizeOptionalString(changesInput.description, `${label}.description`, {
      maxLength: DESCRIPTION_MAX_LENGTH,
    }),
    archived: normalizeOptionalBooleanFlag(changesInput.archived, `${label}.archived`),
  });

  if (!options.partial) {
    if (changes.category_id === undefined) {
      throw new Error(`${label}.category_id is required.`);
    }

    if (changes.amount_cents === undefined) {
      throw new Error(`${label}.amount_cents is required.`);
    }
  }

  ensureHasKeys(changes, label);
  return changes;
}

function create(payload) {
  const row = {
    ...normalizeBudgetChanges(payload, 'payload'),
    created_at: nowUnixTimestampMilliseconds(),
  };
  const insertedId = budgetsModel.create(row);

  return budgetsModel.getById(Number(insertedId));
}

function get(payload) {
  const id = extractId(payload);
  return budgetsModel.getById(id);
}

function list(payload) {
  const { where, options, pagination, all } = normalizeWhereOptionsListPayload(payload, {
    allowedPayloadFields: LIST_PAYLOAD_FIELDS,
    defaultPage: DEFAULT_PAGE,
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  });
  const { limit: _ignoredLimit, offset: _ignoredOffset, ...listOptions } = options;
  const total = budgetsModel.count(where);

  if (all) {
    const rows = budgetsModel.list(where, listOptions);
    const pageSize = rows.length > 0 ? rows.length : DEFAULT_PAGE_SIZE;

    return {
      rows,
      total,
      page: DEFAULT_PAGE,
      page_size: pageSize,
    };
  }

  const { page, offset } = resolvePaginationWindow(total, pagination, { defaultPage: DEFAULT_PAGE });
  const rows = budgetsModel.list(where, {
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
  const changes = normalizeBudgetChanges(body.changes, 'changes', { partial: true });

  const changed = budgetsModel.updateById(id, {
    ...changes,
    updated_at: nowUnixTimestampMilliseconds(),
  });

  return {
    changed,
    row: budgetsModel.getById(id),
  };
}

function remove(payload) {
  const id = extractId(payload);
  const changed = budgetsModel.deleteById(id);

  return { changed };
}

module.exports = {
  create,
  get,
  list,
  remove,
  update,
};
