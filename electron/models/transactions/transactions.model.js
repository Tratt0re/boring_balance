const { createBaseModel } = require('../base-model');
const { TRANSFER_CATEGORY_ID } = require('./constants');
const { normalizeRowTags, normalizeRowsTags } = require('./tags');

const transactionsBaseModel = createBaseModel('transactions');
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;

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

function normalizePagination(pagination = {}) {
  const page = Number.isInteger(pagination.page) && pagination.page > 0 ? pagination.page : DEFAULT_PAGE;
  const pageSize =
    Number.isInteger(pagination.page_size) && pagination.page_size > 0
      ? pagination.page_size
      : DEFAULT_PAGE_SIZE;

  return {
    page,
    page_size: pageSize,
  };
}

function list(filters = {}, pagination = {}) {
  const where = buildListWhere(filters);
  const normalizedPagination = normalizePagination(pagination);
  const total = transactionsBaseModel.count(where);
  const totalPages =
    total === 0 ? DEFAULT_PAGE : Math.max(DEFAULT_PAGE, Math.ceil(total / normalizedPagination.page_size));
  const page = Math.min(normalizedPagination.page, totalPages);
  const offset = (page - 1) * normalizedPagination.page_size;

  const rows = transactionsBaseModel.list(where, {
    orderBy: [
      { column: 'occurred_at', direction: 'DESC' },
      { column: 'id', direction: 'DESC' },
    ],
    limit: normalizedPagination.page_size,
    offset,
  });

  return {
    rows: normalizeRowsTags(rows),
    total,
    page,
    page_size: normalizedPagination.page_size,
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
