const { analyticsModel } = require('../models');
const {
  assertAllowedKeys,
  ensurePlainObject,
  normalizeOptionalBooleanFlag,
  normalizeOptionalEnumArray,
  normalizeOptionalIdArray,
  normalizeUnixTimestampMilliseconds,
  pickDefined,
} = require('./utils');

const FILTER_FIELDS = new Set([
  'from',
  'to',
  'date_from',
  'date_to',
  'account_ids',
  'account_types',
  'category_ids',
  'category_types',
  'settled',
]);
const ALLOWED_ACCOUNT_TYPES = new Set(['cash', 'bank', 'savings', 'brokerage', 'crypto', 'credit']);
const ALLOWED_CATEGORY_TYPES = new Set(['income', 'expense', 'exclude']);

function normalizeDateRangeValue(filters, shortKey, legacyKey, labelPrefix) {
  const shortValue = filters[shortKey];
  const legacyValue = filters[legacyKey];

  if (shortValue === undefined && legacyValue === undefined) {
    return undefined;
  }

  if (shortValue !== undefined && legacyValue !== undefined && Number(shortValue) !== Number(legacyValue)) {
    throw new Error(`${labelPrefix}.${shortKey} and ${labelPrefix}.${legacyKey} must match.`);
  }

  const sourceLabel = shortValue !== undefined ? `${labelPrefix}.${shortKey}` : `${labelPrefix}.${legacyKey}`;
  return normalizeUnixTimestampMilliseconds(shortValue ?? legacyValue, sourceLabel);
}

function normalizePayloadFilters(payload) {
  if (payload === undefined || payload === null) {
    return {};
  }

  const body = ensurePlainObject(payload, 'payload');
  let filtersInput = body;
  let filtersLabel = 'payload';

  if ('filters' in body) {
    assertAllowedKeys(body, new Set(['filters']), 'payload');
    filtersInput = body.filters === undefined ? {} : ensurePlainObject(body.filters, 'payload.filters');
    filtersLabel = 'payload.filters';
  }

  assertAllowedKeys(filtersInput, FILTER_FIELDS, filtersLabel);

  const dateFrom = normalizeDateRangeValue(filtersInput, 'from', 'date_from', filtersLabel);
  const dateTo = normalizeDateRangeValue(filtersInput, 'to', 'date_to', filtersLabel);
  if (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) {
    throw new Error(`${filtersLabel}.from cannot be greater than ${filtersLabel}.to.`);
  }

  return pickDefined({
    date_from: dateFrom,
    date_to: dateTo,
    account_ids: normalizeOptionalIdArray(filtersInput.account_ids, `${filtersLabel}.account_ids`, { dedupe: true }),
    account_types: normalizeOptionalEnumArray(
      filtersInput.account_types,
      `${filtersLabel}.account_types`,
      ALLOWED_ACCOUNT_TYPES,
    ),
    category_ids: normalizeOptionalIdArray(filtersInput.category_ids, `${filtersLabel}.category_ids`, { dedupe: true }),
    category_types: normalizeOptionalEnumArray(
      filtersInput.category_types,
      `${filtersLabel}.category_types`,
      ALLOWED_CATEGORY_TYPES,
    ),
    settled: normalizeOptionalBooleanFlag(filtersInput.settled, `${filtersLabel}.settled`),
  });
}

function expensesIncomesNetCashflowByMonth(payload) {
  const filters = normalizePayloadFilters(payload);
  return analyticsModel.expensesIncomesNetCashflowByMonth(filters);
}

function receivablesPayables(payload) {
  const filters = normalizePayloadFilters(payload);
  return analyticsModel.receivablesPayables(filters);
}

function netWorthByAccount(payload) {
  const filters = normalizePayloadFilters(payload);
  return analyticsModel.netWorthByAccount(filters);
}

function expensesByCategoryByMonth(payload) {
  const filters = normalizePayloadFilters(payload);
  return analyticsModel.expensesByCategoryByMonth(filters);
}

function incomesByCategoryByMonth(payload) {
  const filters = normalizePayloadFilters(payload);
  return analyticsModel.incomesByCategoryByMonth(filters);
}

function moneyFlowSankeyByMonth(payload) {
  const filters = normalizePayloadFilters(payload);
  return analyticsModel.moneyFlowSankeyByMonth(filters);
}

module.exports = {
  expensesIncomesNetCashflowByMonth,
  receivablesPayables,
  netWorthByAccount,
  expensesByCategoryByMonth,
  incomesByCategoryByMonth,
  moneyFlowSankeyByMonth,
};
