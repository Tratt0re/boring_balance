const { createBaseModel } = require('../base-model');
const { TRANSFER_CATEGORY_ID } = require('./constants');
const { normalizeRowTags, normalizeRowsTags } = require('./tags');

const transactionsBaseModel = createBaseModel('transactions');

function buildOccurredAtFilter(filters = {}) {
  const occurredAtFilter = {};

  if (filters.date_from !== undefined) {
    occurredAtFilter.gte = filters.date_from;
  }

  if (filters.date_to !== undefined) {
    occurredAtFilter.lte = filters.date_to;
  }

  return Object.keys(occurredAtFilter).length === 0 ? undefined : occurredAtFilter;
}

function buildListWhere(filters = {}) {
  const where = {
    category_id: { ne: TRANSFER_CATEGORY_ID },
  };

  const occurredAtFilter = buildOccurredAtFilter(filters);
  if (occurredAtFilter) {
    where.occurred_at = occurredAtFilter;
  }

  if (Array.isArray(filters.categories)) {
    where.category_id = {
      ...where.category_id,
      in: filters.categories,
    };
  }

  if (Array.isArray(filters.accounts)) {
    where.account_id = { in: filters.accounts };
  }

  if (filters.settled !== undefined) {
    where.settled = filters.settled;
  }

  return where;
}

function list(filters = {}) {
  const rows = transactionsBaseModel.list(buildListWhere(filters), {
    orderBy: [
      { column: 'occurred_at', direction: 'DESC' },
      { column: 'id', direction: 'DESC' },
    ],
  });

  return normalizeRowsTags(rows);
}

function getById(id) {
  return normalizeRowTags(transactionsBaseModel.getById(id));
}

module.exports = {
  ...transactionsBaseModel,
  getById,
  list,
};
