const { getDatabase } = require('../database');
const { createBaseModel } = require('./base-model');

const transactionsBaseModel = createBaseModel('transactions');
const ALLOWED_ORDER_BY_FIELDS = new Set(['occurred_at', 'created_at', 'id', 'amount_cents']);

function resolveOrderBy(options) {
  if (options.orderBy && ALLOWED_ORDER_BY_FIELDS.has(options.orderBy)) {
    return options.orderBy;
  }

  return 'occurred_at';
}

function resolveOrderDirection(options) {
  return options.orderDirection === 'ASC' ? 'ASC' : 'DESC';
}

function appendPagingClause(sql, params, options) {
  const hasLimit = Number.isInteger(options.limit) && options.limit > 0;
  const hasOffset = Number.isInteger(options.offset) && options.offset >= 0;

  if (hasLimit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  if (hasOffset && !hasLimit) {
    sql += ' LIMIT -1';
  }

  if (hasOffset) {
    sql += ' OFFSET ?';
    params.push(options.offset);
  }

  return sql;
}

function buildPaginationOptions(options = {}) {
  const page = options.page;
  const perPage = options.perPage;

  return {
    orderBy: resolveOrderBy(options),
    orderDirection: resolveOrderDirection(options),
    limit: perPage,
    offset: (page - 1) * perPage,
  };
}

function listPaginated(where = {}, options = {}) {
  const queryOptions = buildPaginationOptions(options);
  const rows = transactionsBaseModel.list(where, queryOptions);
  const totalTransactions = transactionsBaseModel.count(where);

  return { rows, totalTransactions };
}

function listByAccount(accountId, options = {}) {
  return listPaginated({ account_id: accountId }, options);
}

function listByCategory(categoryId, options = {}) {
  return listPaginated({ category_id: categoryId }, options);
}

function listUnsettled(options = {}) {
  return listPaginated({ settled: 0 }, options);
}

function buildDateRangeWhereClause(filters = {}) {
  const whereClauses = [];
  const params = [];

  if (filters.from !== undefined) {
    whereClauses.push('"occurred_at" >= ?');
    params.push(filters.from);
  }

  if (filters.to !== undefined) {
    whereClauses.push('"occurred_at" <= ?');
    params.push(filters.to);
  }

  if (filters.accountId !== undefined) {
    whereClauses.push('"account_id" = ?');
    params.push(filters.accountId);
  }

  if (filters.categoryId !== undefined) {
    whereClauses.push('"category_id" = ?');
    params.push(filters.categoryId);
  }

  if (filters.settled !== undefined) {
    whereClauses.push('"settled" = ?');
    params.push(filters.settled);
  }

  if (filters.transferId === null) {
    whereClauses.push('"transfer_id" IS NULL');
  } else if (filters.transferId !== undefined) {
    whereClauses.push('"transfer_id" = ?');
    params.push(filters.transferId);
  }

  return {
    whereSql: whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '',
    params,
  };
}

function listByDateRange(filters = {}, options = {}) {
  const database = getDatabase();
  const { whereSql, params } = buildDateRangeWhereClause(filters);
  const pagingOptions = buildPaginationOptions(options);
  const orderBy = pagingOptions.orderBy;
  const orderDirection = pagingOptions.orderDirection;
  const dataParams = [...params];
  let sql = `SELECT * FROM "transactions"${whereSql}`;
  sql += ` ORDER BY "${orderBy}" ${orderDirection}, "id" ${orderDirection}`;
  sql = appendPagingClause(sql, dataParams, pagingOptions);

  const rows = database.prepare(sql).all(dataParams);
  const countSql = `SELECT COUNT(*) AS "total" FROM "transactions"${whereSql}`;
  const countRow = database.prepare(countSql).get(params);
  const totalTransactions = Number(countRow?.total ?? 0);

  return { rows, totalTransactions };
}

module.exports = {
  ...transactionsBaseModel,
  listPaginated,
  listByAccount,
  listByCategory,
  listUnsettled,
  listByDateRange,
};
