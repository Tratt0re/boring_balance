const { createBaseModel } = require('../base-model');
const { DEFAULT_PAGE, resolvePaginationWindow } = require('../pagination');
const { getDatabase, selectRows } = require('../../database');
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

function buildAmountCentsFilter(filters = {}) {
  const amountCentsFilter = {};

  if (filters.amount_from !== undefined) {
    amountCentsFilter.absGte = filters.amount_from;
  }

  if (filters.amount_to !== undefined) {
    amountCentsFilter.absLte = filters.amount_to;
  }

  return Object.keys(amountCentsFilter).length === 0 ? undefined : amountCentsFilter;
}

function resolveCategoryIdsFilter(filters = {}) {
  const hasCategoryIdsFilter = Array.isArray(filters.categories);
  const hasCategoryTypesFilter = Array.isArray(filters.category_types);

  if (!hasCategoryTypesFilter) {
    return hasCategoryIdsFilter ? filters.categories : undefined;
  }

  const categoriesWhere = {
    type: { in: filters.category_types },
  };

  if (hasCategoryIdsFilter) {
    categoriesWhere.id = { in: filters.categories };
  }

  const categories = selectRows(getDatabase(), 'categories', categoriesWhere);
  return categories.map((category) => Number(category.id));
}

function buildListWhere(filters = {}) {
  const where = {
    category_id: { ne: TRANSFER_CATEGORY_ID },
  };

  const occurredAtFilter = buildOccurredAtFilter(filters);
  if (occurredAtFilter) {
    where.occurred_at = occurredAtFilter;
  }

  const categoryIdsFilter = resolveCategoryIdsFilter(filters);
  if (Array.isArray(categoryIdsFilter)) {
    where.category_id = {
      ...where.category_id,
      in: categoryIdsFilter,
    };
  }

  if (Array.isArray(filters.accounts)) {
    where.account_id = { in: filters.accounts };
  }

  const amountCentsFilter = buildAmountCentsFilter(filters);
  if (amountCentsFilter) {
    where.amount_cents = amountCentsFilter;
  }

  if (filters.settled !== undefined) {
    where.settled = filters.settled;
  }

  return where;
}

function list(filters = {}, pagination = {}) {
  const where = buildListWhere(filters);
  const total = transactionsBaseModel.count(where);
  const paginationWindow = resolvePaginationWindow(total, pagination, { defaultPage: DEFAULT_PAGE });

  const rows = transactionsBaseModel.list(where, {
    orderBy: [
      { column: 'occurred_at', direction: 'DESC' },
      { column: 'id', direction: 'DESC' },
    ],
    limit: paginationWindow.page_size,
    offset: paginationWindow.offset,
  });

  return {
    rows: normalizeRowsTags(rows),
    total,
    page: paginationWindow.page,
    page_size: paginationWindow.page_size,
  };
}

function getById(id) {
  return normalizeRowTags(transactionsBaseModel.getById(id));
}

module.exports = {
  ...transactionsBaseModel,
  getById,
  list,
};
