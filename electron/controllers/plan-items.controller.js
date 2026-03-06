const { planItemsModel } = require('../models');
const { transactionsController, transfersController } = require('./transactions');
const {
  requireString,
  assertAllowedKeys,
  ensureHasKeys,
  ensureNonEmptyObject,
  ensurePlainObject,
  extractId,
  normalizeFiltersListPayload,
  normalizeEnum,
  normalizeInteger,
  normalizeOptionalBooleanFlag,
  normalizeOptionalString,
  normalizePositiveInteger,
  normalizeUnixTimestampMilliseconds,
  nowUnixTimestampMilliseconds,
  pickDefined,
  resolvePaginationWindow,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} = require('./utils');

const PLAN_TYPES = new Set(['transaction', 'transfer']);
const FREQUENCY_UNITS = new Set(['day', 'week', 'month', 'year']);
const MONTH_POLICIES = new Set(['clip', 'skip', 'last_day', 'first_day']);

const PLAN_CREATE_FIELDS = new Set(['title', 'type', 'template_json', 'rule_json', 'create_and_run']);
const PLAN_UPDATE_FIELDS = new Set(['title', 'type', 'template_json', 'rule_json']);
const PLAN_LIST_PAYLOAD_FIELDS = new Set(['filters', 'page', 'page_size']);
const PLAN_LIST_FILTER_FIELDS = new Set(['type']);
const PLAN_RUN_FIELDS = new Set(['id']);
const PLAN_REMOVE_FIELDS = new Set(['id', 'delete_planned_items']);

const RULE_JSON_FIELDS = new Set(['start_date', 'count', 'frequency', 'month_policy']);
const RULE_FREQUENCY_FIELDS = new Set(['unit', 'interval']);
const TRANSACTION_TEMPLATE_FIELDS = new Set(['amount_cents', 'account_id', 'category_id', 'description', 'settled']);
const TRANSFER_TEMPLATE_FIELDS = new Set([
  'amount_cents',
  'from_account_id',
  'to_account_id',
  'description',
  'settled',
]);

const TITLE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 75;

function amountCentsToAmount(amountCents) {
  return Number(amountCents) / 100;
}

function buildPlanRunExecutors() {
  return {
    createTransaction(planItem, occurredAt) {
      const template = planItem.template_json;

      return transactionsController.create(
        {
          occurred_at: occurredAt,
          account_id: template.account_id,
          category_id: template.category_id,
          amount: amountCentsToAmount(template.amount_cents),
          description: template.description,
          ...(template.settled === undefined ? {} : { settled: template.settled }),
        },
        { plan_item_id: planItem.id },
      );
    },
    createTransfer(planItem, occurredAt) {
      const template = planItem.template_json;

      return transfersController.create(
        {
          occurred_at: occurredAt,
          from_account_id: template.from_account_id,
          to_account_id: template.to_account_id,
          amount: amountCentsToAmount(template.amount_cents),
          description: template.description,
          ...(template.settled === undefined ? {} : { settled: template.settled }),
        },
        { plan_item_id: planItem.id },
      );
    },
  };
}

function normalizeFrequencyRule(value, label) {
  const frequency = ensurePlainObject(value, label);
  assertAllowedKeys(frequency, RULE_FREQUENCY_FIELDS, label);

  return {
    unit: normalizeEnum(frequency.unit, `${label}.unit`, FREQUENCY_UNITS),
    interval: normalizePositiveInteger(frequency.interval, `${label}.interval`),
  };
}

function normalizeRuleJson(value, label) {
  const rule = ensurePlainObject(value, label);
  assertAllowedKeys(rule, RULE_JSON_FIELDS, label);

  const frequency = normalizeFrequencyRule(rule.frequency, `${label}.frequency`);
  const monthPolicy =
    rule.month_policy === undefined ? undefined : normalizeEnum(rule.month_policy, `${label}.month_policy`, MONTH_POLICIES);

  if (monthPolicy !== undefined && frequency.unit !== 'month' && frequency.unit !== 'year') {
    throw new Error(`${label}.month_policy is only supported when frequency.unit is "month" or "year".`);
  }

  const normalizedRule = {
    start_date: normalizeUnixTimestampMilliseconds(rule.start_date, `${label}.start_date`),
    count: normalizePositiveInteger(rule.count, `${label}.count`),
    frequency,
  };

  if (frequency.unit === 'month' || frequency.unit === 'year') {
    normalizedRule.month_policy = monthPolicy ?? 'clip';
  }

  return normalizedRule;
}

function normalizeTransactionTemplateJson(value, label) {
  const template = ensurePlainObject(value, label);
  assertAllowedKeys(template, TRANSACTION_TEMPLATE_FIELDS, label);

  const normalizedTemplate = {
    amount_cents: normalizeInteger(template.amount_cents, `${label}.amount_cents`),
    account_id: normalizePositiveInteger(template.account_id, `${label}.account_id`),
    category_id: normalizePositiveInteger(template.category_id, `${label}.category_id`),
    description:
      normalizeOptionalString(template.description, `${label}.description`, {
        allowEmpty: true,
        maxLength: DESCRIPTION_MAX_LENGTH,
      }) ?? '',
  };

  const settled = normalizeOptionalBooleanFlag(template.settled, `${label}.settled`);
  if (settled !== undefined) {
    normalizedTemplate.settled = settled;
  }

  return normalizedTemplate;
}

function normalizeTransferTemplateJson(value, label) {
  const template = ensurePlainObject(value, label);
  assertAllowedKeys(template, TRANSFER_TEMPLATE_FIELDS, label);

  const amountCents = normalizePositiveInteger(template.amount_cents, `${label}.amount_cents`);
  const fromAccountId = normalizePositiveInteger(template.from_account_id, `${label}.from_account_id`);
  const toAccountId = normalizePositiveInteger(template.to_account_id, `${label}.to_account_id`);
  if (fromAccountId === toAccountId) {
    throw new Error(`${label}.from_account_id and ${label}.to_account_id must be different.`);
  }

  const normalizedTemplate = {
    amount_cents: amountCents,
    from_account_id: fromAccountId,
    to_account_id: toAccountId,
    description:
      normalizeOptionalString(template.description, `${label}.description`, {
        allowEmpty: true,
        maxLength: DESCRIPTION_MAX_LENGTH,
      }) ?? '',
  };

  const settled = normalizeOptionalBooleanFlag(template.settled, `${label}.settled`);
  if (settled !== undefined) {
    normalizedTemplate.settled = settled;
  }

  return normalizedTemplate;
}

function normalizeTemplateJsonForType(value, type, label) {
  if (type === 'transaction') {
    return normalizeTransactionTemplateJson(value, label);
  }

  if (type === 'transfer') {
    return normalizeTransferTemplateJson(value, label);
  }

  throw new Error(`Unsupported plan type "${type}".`);
}

function normalizeListPayload(payload) {
  const { filters, pagination } = normalizeFiltersListPayload(payload, {
    allowedPayloadFields: PLAN_LIST_PAYLOAD_FIELDS,
    allowedFilterFields: PLAN_LIST_FILTER_FIELDS,
    defaultPage: DEFAULT_PAGE,
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  });

  const normalizedFilters = pickDefined({
    type: filters.type === undefined ? undefined : normalizeEnum(filters.type, 'payload.filters.type', PLAN_TYPES),
  });

  return {
    filters: normalizedFilters,
    pagination,
  };
}

function create(payload) {
  const body = ensurePlainObject(payload, 'payload');
  assertAllowedKeys(body, PLAN_CREATE_FIELDS, 'payload');

  const type = normalizeEnum(body.type, 'payload.type', PLAN_TYPES);
  const row = {
    title: requireString(body.title, 'payload.title', { allowEmpty: false, maxLength: TITLE_MAX_LENGTH }),
    type,
    template_json: JSON.stringify(normalizeTemplateJsonForType(body.template_json, type, 'payload.template_json')),
    rule_json: JSON.stringify(normalizeRuleJson(body.rule_json, 'payload.rule_json')),
    created_at: nowUnixTimestampMilliseconds(),
  };

  const createAndRun = normalizeOptionalBooleanFlag(body.create_and_run, 'payload.create_and_run') === 1;
  const insertedId = Number(planItemsModel.create(row));
  const createdRow = planItemsModel.getById(insertedId);

  if (!createAndRun) {
    return createdRow;
  }

  return {
    row: createdRow,
    run: planItemsModel.run(insertedId, {
      ...buildPlanRunExecutors(),
    }),
  };
}

function get(payload) {
  const id = extractId(payload);
  return planItemsModel.getById(id);
}

function list(payload) {
  const { filters, pagination } = normalizeListPayload(payload);
  const total = planItemsModel.count(filters);
  const { page, offset } = resolvePaginationWindow(total, pagination, { defaultPage: DEFAULT_PAGE });
  const rows = planItemsModel.list(filters, {
    orderBy: [
      { column: 'created_at', direction: 'DESC' },
      { column: 'id', direction: 'DESC' },
    ],
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
  assertAllowedKeys(body, new Set(['id', 'changes']), 'payload');

  const id = extractId({ id: body.id });
  const existingRow = planItemsModel.getById(id);
  if (!existingRow) {
    throw new Error(`Plan item not found for id ${id}.`);
  }

  const changesInput = ensureNonEmptyObject(body.changes, 'payload.changes');
  assertAllowedKeys(changesInput, PLAN_UPDATE_FIELDS, 'payload.changes');

  let type;
  if (changesInput.type !== undefined) {
    const normalizedType = normalizeEnum(changesInput.type, 'payload.changes.type', PLAN_TYPES);
    if (normalizedType !== existingRow.type) {
      throw new Error('payload.changes.type cannot be updated.');
    }
  }

  const nextType = existingRow.type;

  let templateJson;
  if (changesInput.template_json !== undefined) {
    templateJson = normalizeTemplateJsonForType(changesInput.template_json, nextType, 'payload.changes.template_json');
  }

  let ruleJson;
  if (changesInput.rule_json !== undefined) {
    ruleJson = normalizeRuleJson(changesInput.rule_json, 'payload.changes.rule_json');
    const currentStartDate = Number(existingRow.rule_json?.start_date);
    if (Number(ruleJson.start_date) !== currentStartDate) {
      throw new Error('payload.changes.rule_json.start_date cannot be updated.');
    }
  }

  const changes = pickDefined({
    title: normalizeOptionalString(changesInput.title, 'payload.changes.title', {
      allowNull: false,
      maxLength: TITLE_MAX_LENGTH,
    }),
    type,
    template_json: templateJson === undefined ? undefined : JSON.stringify(templateJson),
    rule_json: ruleJson === undefined ? undefined : JSON.stringify(ruleJson),
  });

  ensureHasKeys(changes, 'payload.changes');
  const changed = planItemsModel.updateById(id, {
    ...changes,
    updated_at: nowUnixTimestampMilliseconds(),
  });

  return {
    changed,
    row: planItemsModel.getById(id),
  };
}

function remove(payload) {
  if (typeof payload === 'number' || typeof payload === 'string') {
    return planItemsModel.removePlanItem(extractId(payload), { delete_planned_items: false });
  }

  const body = ensurePlainObject(payload, 'payload');
  assertAllowedKeys(body, PLAN_REMOVE_FIELDS, 'payload');

  const id = extractId({ id: body.id });
  const deletePlannedItems = normalizeOptionalBooleanFlag(body.delete_planned_items, 'payload.delete_planned_items') === 1;

  return planItemsModel.removePlanItem(id, {
    delete_planned_items: deletePlannedItems,
  });
}

function run(payload) {
  let id;
  if (typeof payload === 'number' || typeof payload === 'string') {
    id = extractId(payload);
  } else {
    const body = ensurePlainObject(payload, 'payload');
    assertAllowedKeys(body, PLAN_RUN_FIELDS, 'payload');
    id = extractId({ id: body.id });
  }

  return planItemsModel.run(id, buildPlanRunExecutors());
}

function deletePlannedItems(payload) {
  const id = extractId(payload);
  return planItemsModel.deletePlannedItems(id);
}

module.exports = {
  create,
  get,
  list,
  update,
  remove,
  run,
  deletePlannedItems,
};
