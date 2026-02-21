const { getDatabase, selectRows } = require('../database');
const { TRANSFER_CATEGORY_ID } = require('./transactions/constants');
const { normalizeRowsTags } = require('./transactions/tags');

const TRANSACTION_ASC_ORDER = [
  { column: 'occurred_at', direction: 'ASC' },
  { column: 'id', direction: 'ASC' },
];
const TRANSACTION_DESC_ORDER = [
  { column: 'occurred_at', direction: 'DESC' },
  { column: 'id', direction: 'DESC' },
];

function toMonthKey(unixTimestampMilliseconds) {
  const date = new Date(Number(unixTimestampMilliseconds));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function appendNotEqualFilter(existingFilter, value) {
  if (existingFilter === undefined) {
    return { ne: value };
  }

  if (Array.isArray(existingFilter)) {
    return {
      in: existingFilter,
      ne: value,
    };
  }

  if (existingFilter && typeof existingFilter === 'object') {
    return {
      ...existingFilter,
      ne: value,
    };
  }

  return {
    eq: existingFilter,
    ne: value,
  };
}

function resolveFilterContext(database, filters = {}) {
  const accounts = selectRows(database, 'accounts', {}, { orderBy: 'id', orderDirection: 'ASC' });
  const categories = selectRows(database, 'categories', {}, { orderBy: 'id', orderDirection: 'ASC' });

  const accountIdsFilter = Array.isArray(filters.account_ids) ? new Set(filters.account_ids.map(Number)) : null;
  const accountTypesFilter = Array.isArray(filters.account_types) ? new Set(filters.account_types) : null;
  const categoryIdsFilter = Array.isArray(filters.category_ids) ? new Set(filters.category_ids.map(Number)) : null;
  const categoryTypesFilter = Array.isArray(filters.category_types) ? new Set(filters.category_types) : null;

  const filteredAccounts = accounts.filter((account) => {
    if (accountIdsFilter && !accountIdsFilter.has(Number(account.id))) {
      return false;
    }

    if (accountTypesFilter && !accountTypesFilter.has(account.type)) {
      return false;
    }

    return true;
  });
  const filteredCategories = categories.filter((category) => {
    if (categoryIdsFilter && !categoryIdsFilter.has(Number(category.id))) {
      return false;
    }

    if (categoryTypesFilter && !categoryTypesFilter.has(category.type)) {
      return false;
    }

    return true;
  });

  return {
    accounts,
    categories,
    accountById: new Map(accounts.map((account) => [Number(account.id), account])),
    categoryById: new Map(categories.map((category) => [Number(category.id), category])),
    filteredAccounts,
    filteredCategories,
    hasAccountFilter: Boolean(accountIdsFilter || accountTypesFilter),
    hasCategoryFilter: Boolean(categoryIdsFilter || categoryTypesFilter),
    filteredAccountIds: filteredAccounts.map((account) => Number(account.id)),
    filteredCategoryIds: filteredCategories.map((category) => Number(category.id)),
  };
}

function buildTransactionsWhere(filters = {}, filterContext, options = {}) {
  const where = {};

  if (filters.date_from !== undefined || filters.date_to !== undefined) {
    const occurredAtFilter = {};

    if (filters.date_from !== undefined) {
      occurredAtFilter.gte = filters.date_from;
    }

    if (filters.date_to !== undefined) {
      occurredAtFilter.lte = filters.date_to;
    }

    where.occurred_at = occurredAtFilter;
  }

  if (filters.settled !== undefined) {
    where.settled = filters.settled;
  }

  if (filterContext.hasAccountFilter) {
    where.account_id = {
      in: filterContext.filteredAccountIds,
    };
  }

  if (filterContext.hasCategoryFilter) {
    where.category_id = {
      in: filterContext.filteredCategoryIds,
    };
  }

  if (options.excludeTransfers) {
    where.transfer_id = { isNull: true };
    where.category_id = appendNotEqualFilter(where.category_id, TRANSFER_CATEGORY_ID);
  }

  return where;
}

function selectTransactions(database, where, orderBy = TRANSACTION_ASC_ORDER) {
  return selectRows(database, 'transactions', where, { orderBy });
}

function expensesIncomesProfitByMonth(filters = {}) {
  const database = getDatabase();
  const filterContext = resolveFilterContext(database, filters);
  const rows = selectTransactions(
    database,
    buildTransactionsWhere(filters, filterContext, { excludeTransfers: true }),
    TRANSACTION_ASC_ORDER,
  );
  const totalsByMonth = new Map();

  for (const row of rows) {
    const category = filterContext.categoryById.get(Number(row.category_id));
    if (!category || category.type === 'exclude') {
      continue;
    }

    const amountCents = Number(row.amount_cents ?? 0);
    if (amountCents === 0) {
      continue;
    }

    const month = toMonthKey(row.occurred_at);
    const currentMonth = totalsByMonth.get(month) ?? {
      month,
      expenses_cents: 0,
      incomes_cents: 0,
      profit_cents: 0,
    };

    if (category.type === 'expense') {
      currentMonth.expenses_cents += amountCents;
    } else if (category.type === 'income') {
      currentMonth.incomes_cents += amountCents;
    }

    totalsByMonth.set(month, currentMonth);
  }

  const aggregatedRows = Array.from(totalsByMonth.values())
    .map((entry) => ({
      ...entry,
      profit_cents: entry.incomes_cents + entry.expenses_cents,
    }))
    .sort((left, right) => left.month.localeCompare(right.month));

  return { rows: aggregatedRows };
}

function receivablesPayables(filters = {}) {
  const effectiveFilters = filters.settled === undefined ? { ...filters, settled: 0 } : filters;
  const database = getDatabase();
  const filterContext = resolveFilterContext(database, effectiveFilters);
  const rows = selectTransactions(
    database,
    buildTransactionsWhere(effectiveFilters, filterContext, { excludeTransfers: true }),
    TRANSACTION_DESC_ORDER,
  );

  const receivables = [];
  const payables = [];
  let receivablesTotal = 0;
  let payablesTotal = 0;

  for (const row of normalizeRowsTags(rows)) {
    if (Number(row.settled) !== 0) {
      continue;
    }

    const amountCents = Number(row.amount_cents ?? 0);
    if (amountCents > 0) {
      receivables.push(row);
      receivablesTotal += amountCents;
      continue;
    }

    if (amountCents < 0) {
      payables.push(row);
      payablesTotal += Math.abs(amountCents);
    }
  }

  return {
    receivables,
    payables,
    totals: {
      receivables_cents: receivablesTotal,
      payables_cents: payablesTotal,
    },
  };
}

function netWorthByAccount(filters = {}) {
  const effectiveFilters = filters.settled === undefined ? { ...filters, settled: 1 } : filters;
  const database = getDatabase();
  const filterContext = resolveFilterContext(database, effectiveFilters);
  const rows = selectTransactions(database, buildTransactionsWhere(effectiveFilters, filterContext), TRANSACTION_ASC_ORDER);
  const netWorthByAccountId = new Map();

  for (const row of rows) {
    const accountId = Number(row.account_id);
    const amountCents = Number(row.amount_cents ?? 0);
    netWorthByAccountId.set(accountId, (netWorthByAccountId.get(accountId) ?? 0) + amountCents);
  }

  const accountsToReport = filterContext.hasAccountFilter ? filterContext.filteredAccounts : filterContext.accounts;
  const sortedAccounts = [...accountsToReport].sort((left, right) => Number(left.id) - Number(right.id));

  return {
    rows: sortedAccounts.map((account) => {
      const accountId = Number(account.id);

      return {
        account_id: accountId,
        account_name: account.name,
        account_type: account.type,
        net_worth_cents: netWorthByAccountId.get(accountId) ?? 0,
      };
    }),
  };
}

function aggregateByCategoryAndMonth(rows, filterContext, targetCategoryType) {
  const groupedValues = new Map();

  for (const row of rows) {
    const categoryId = Number(row.category_id);
    const category = filterContext.categoryById.get(categoryId);
    if (!category || category.type !== targetCategoryType) {
      continue;
    }

    const amountCents = Number(row.amount_cents ?? 0);
    if (amountCents === 0) {
      continue;
    }

    const month = toMonthKey(row.occurred_at);
    const key = `${month}:${categoryId}`;
    const currentEntry = groupedValues.get(key) ?? {
      month,
      category_id: categoryId,
      category_name: category.name,
      category_type: category.type,
      total_cents: 0,
    };
    currentEntry.total_cents += amountCents;
    groupedValues.set(key, currentEntry);
  }

  return Array.from(groupedValues.values()).sort((left, right) => {
    const monthComparison = left.month.localeCompare(right.month);
    if (monthComparison !== 0) {
      return monthComparison;
    }

    const totalComparison = right.total_cents - left.total_cents;
    if (totalComparison !== 0) {
      return totalComparison;
    }

    return String(left.category_name).localeCompare(String(right.category_name));
  });
}

function expensesByCategoryByMonth(filters = {}) {
  const database = getDatabase();
  const filterContext = resolveFilterContext(database, filters);
  const rows = selectTransactions(
    database,
    buildTransactionsWhere(filters, filterContext, { excludeTransfers: true }),
    TRANSACTION_ASC_ORDER,
  );

  return {
    rows: aggregateByCategoryAndMonth(rows, filterContext, 'expense'),
  };
}

function incomesByCategoryByMonth(filters = {}) {
  const database = getDatabase();
  const filterContext = resolveFilterContext(database, filters);
  const rows = selectTransactions(
    database,
    buildTransactionsWhere(filters, filterContext, { excludeTransfers: true }),
    TRANSACTION_ASC_ORDER,
  );

  return {
    rows: aggregateByCategoryAndMonth(rows, filterContext, 'income'),
  };
}

module.exports = {
  expensesIncomesProfitByMonth,
  receivablesPayables,
  netWorthByAccount,
  expensesByCategoryByMonth,
  incomesByCategoryByMonth,
};
