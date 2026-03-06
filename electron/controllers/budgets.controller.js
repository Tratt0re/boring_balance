const { budgetsModel } = require('../models');
const {
  assertAllowedKeys,
  ensureHasKeys,
  ensureNonEmptyObject,
  ensurePlainObject,
  executeWhereOptionsListQuery,
  extractId,
  nowUnixTimestampMilliseconds,
  normalizeOptionalBooleanFlag,
  normalizeOptionalString,
  normalizePositiveInteger,
  normalizeWhereOptionsListPayload,
  pickDefined,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} = require('./utils');

const BUDGET_FIELDS = new Set(['category_id', 'amount_cents', 'include_children', 'description', 'archived']);
const LIST_PAYLOAD_FIELDS = new Set(['where', 'options', 'page', 'page_size', 'all']);
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

  return executeWhereOptionsListQuery(budgetsModel, { where, listOptions, pagination, all });
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
