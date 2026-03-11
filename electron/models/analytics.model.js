const { getDatabase, selectDistinctYearsFromUnixTimestampColumn, selectRows } = require('../database');
const { elapsedDaysBetweenUnixTimestampMilliseconds, formatUnixTimestampMillisecondsToDate } = require('../utils/date-utils');
const { buildDateRangeFilter } = require('./query-utils');
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
const TRANSFER_ORDER = [
  { column: 'occurred_at', direction: 'ASC' },
  { column: 'id', direction: 'ASC' },
];
const SNAPSHOT_OUTDATED_DAYS_THRESHOLD = 7;
const LIQUID_ACCOUNT_TYPES = new Set(['cash', 'bank', 'savings']);
const INVESTMENT_ACCOUNT_TYPES = new Set(['brokerage', 'crypto']);

function toMonthKey(unixTimestampMilliseconds) {
  const date = new Date(Number(unixTimestampMilliseconds));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function toMonthRangeFromSelection(selection) {
  const year = Number(selection?.year);
  const monthIndex = Number(selection?.month_index);
  const from = new Date(year, monthIndex, 1, 0, 0, 0, 0).getTime();
  const to = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999).getTime();

  return {
    year,
    month_index: monthIndex,
    month_key: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    from,
    to,
  };
}

function toYearRange(year) {
  const normalizedYear = Number(year);
  const from = new Date(normalizedYear, 0, 1, 0, 0, 0, 0).getTime();
  const to = new Date(normalizedYear, 11, 31, 23, 59, 59, 999).getTime();

  return {
    year: normalizedYear,
    from,
    to,
  };
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

  const occurredAtFilter = buildDateRangeFilter(filters.date_from, filters.date_to);
  if (occurredAtFilter) {
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

function buildTransfersWhere(filters = {}) {
  const where = {};

  const occurredAtFilter = buildDateRangeFilter(filters.date_from, filters.date_to);
  if (occurredAtFilter) {
    where.occurred_at = occurredAtFilter;
  }

  if (filters.settled !== undefined) {
    where.settled = filters.settled;
  }

  return where;
}

function selectTransfers(database, where, orderBy = TRANSFER_ORDER) {
  return selectRows(database, 'transfers', where, { orderBy });
}

function normalizeAccountIds(accountIds = []) {
  return Array.from(new Set(
    accountIds
      .map((accountId) => Number(accountId))
      .filter((accountId) => Number.isInteger(accountId) && accountId > 0),
  ));
}

function selectLatestValuationByAccountIds(database, accountIds = []) {
  const normalizedAccountIds = normalizeAccountIds(accountIds);
  if (normalizedAccountIds.length === 0) {
    return [];
  }

  const placeholdersSql = normalizedAccountIds.map(() => '?').join(', ');
  const sql = `
    SELECT
      latest.account_id AS account_id,
      latest.latest_valued_at AS valued_at,
      valuation.value_cents AS value_cents
    FROM (
      SELECT
        account_id AS account_id,
        MAX(valued_at) AS latest_valued_at
      FROM account_valuations
      WHERE account_id IN (${placeholdersSql})
        AND valued_at > 0
      GROUP BY account_id
    ) AS latest
    INNER JOIN account_valuations AS valuation
      ON valuation.account_id = latest.account_id
      AND valuation.valued_at = latest.latest_valued_at
  `;

  return database.prepare(sql).all(normalizedAccountIds);
}

function selectLatestSnapshotTimestampMs(database, accountIds) {
  let row;
  if (accountIds === undefined) {
    row = database.prepare(`
      SELECT
        MAX(valued_at) AS latest_snapshot_at_ms
      FROM account_valuations
      WHERE valued_at > 0
    `).get();
  } else {
    const normalizedAccountIds = normalizeAccountIds(accountIds);
    if (normalizedAccountIds.length === 0) {
      return null;
    }

    const placeholdersSql = normalizedAccountIds.map(() => '?').join(', ');
    row = database.prepare(`
      SELECT
        MAX(valued_at) AS latest_snapshot_at_ms
      FROM account_valuations
      WHERE account_id IN (${placeholdersSql})
        AND valued_at > 0
    `).get(normalizedAccountIds);
  }

  const latestSnapshotAtMs = Number(row?.latest_snapshot_at_ms);

  return Number.isFinite(latestSnapshotAtMs) && latestSnapshotAtMs > 0 ? latestSnapshotAtMs : null;
}

function resolveUseValuationFlag(filters = {}) {
  if (filters.useValuation === undefined) {
    return true;
  }

  if (filters.useValuation === true || filters.useValuation === 1) {
    return true;
  }

  if (filters.useValuation === false || filters.useValuation === 0) {
    return false;
  }

  return Number(filters.useValuation) === 1;
}

function normalizeBucketsToTargetTotalCents(buckets, targetTotalCents) {
  const normalizedTarget = Math.max(0, Math.round(Number(targetTotalCents ?? 0)));
  if (!Array.isArray(buckets) || buckets.length === 0 || normalizedTarget <= 0) {
    return [];
  }

  const positiveBuckets = buckets.filter((bucket) => Number(bucket?.total_cents ?? 0) > 0);
  if (positiveBuckets.length === 0) {
    return [];
  }

  const rawTotalCents = positiveBuckets.reduce((total, bucket) => total + Number(bucket.total_cents ?? 0), 0);
  if (rawTotalCents <= 0) {
    return [];
  }

  const allocations = positiveBuckets.map((bucket, index) => {
    const rawValue = Number(bucket.total_cents ?? 0);
    const scaledValue = (rawValue * normalizedTarget) / rawTotalCents;
    const flooredValue = Math.floor(scaledValue);

    return {
      bucket,
      index,
      total_cents: flooredValue,
      fractional: scaledValue - flooredValue,
    };
  });

  const allocatedTotal = allocations.reduce((total, entry) => total + entry.total_cents, 0);
  const remainingCents = Math.max(0, normalizedTarget - allocatedTotal);
  allocations
    .slice()
    .sort((left, right) => {
      const fractionComparison = right.fractional - left.fractional;
      if (fractionComparison !== 0) {
        return fractionComparison;
      }

      return left.index - right.index;
    })
    .slice(0, remainingCents)
    .forEach((entry) => {
      entry.total_cents += 1;
    });

  return allocations
    .map((entry) => ({
      ...entry.bucket,
      total_cents: entry.total_cents,
    }))
    .filter((entry) => Number(entry.total_cents ?? 0) > 0);
}

function buildMoneyFlowExpenseByCategory(expenseTotalsByCategoryId, expensesTotalCents) {
  const normalizedExpenseTotalCents = Math.max(0, Number(expensesTotalCents ?? 0));
  if (normalizedExpenseTotalCents <= 0) {
    return [];
  }

  const rawExpenseBuckets = Array.from(expenseTotalsByCategoryId.values())
    .map((entry) => ({
      category_id: Number(entry.category_id),
      category_name: entry.category_name,
      total_cents: Math.abs(Number(entry.total_cents ?? 0)),
    }))
    .filter((entry) => entry.total_cents > 0);

  const normalizedExpenseBuckets = normalizeBucketsToTargetTotalCents(rawExpenseBuckets, normalizedExpenseTotalCents)
    .sort((left, right) => {
      const totalComparison = Number(right.total_cents ?? 0) - Number(left.total_cents ?? 0);
      if (totalComparison !== 0) {
        return totalComparison;
      }

      return String(left.category_name).localeCompare(String(right.category_name));
    });
  return normalizedExpenseBuckets;
}

function expensesIncomesNetCashflowByMonth(filters = {}) {
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
      net_cashflow_cents: 0,
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
      net_cashflow_cents: entry.incomes_cents + entry.expenses_cents,
    }))
    .sort((left, right) => left.month.localeCompare(right.month));

  return { rows: aggregatedRows };
}

function availableYears(filters = {}) {
  const database = getDatabase();
  const filterContext = resolveFilterContext(database, filters);
  const where = buildTransactionsWhere(filters, filterContext, { excludeTransfers: true });
  const years = selectDistinctYearsFromUnixTimestampColumn(database, 'transactions', 'occurred_at', where);

  return { years };
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
  const useValuation = resolveUseValuationFlag(effectiveFilters);
  const database = getDatabase();
  const filterContext = resolveFilterContext(database, effectiveFilters);
  const rows = selectTransactions(database, buildTransactionsWhere(effectiveFilters, filterContext), TRANSACTION_ASC_ORDER);
  const netWorthByAccountId = new Map();
  let currentTotalCents = 0;

  for (const row of rows) {
    const accountId = Number(row.account_id);
    const amountCents = Number(row.amount_cents ?? 0);
    netWorthByAccountId.set(accountId, (netWorthByAccountId.get(accountId) ?? 0) + amountCents);
    currentTotalCents += amountCents;
  }

  const accountsToReport = filterContext.hasAccountFilter ? filterContext.filteredAccounts : filterContext.accounts;
  const sortedAccounts = [...accountsToReport].sort((left, right) => Number(left.id) - Number(right.id));
  const sortedAccountIds = sortedAccounts.map((account) => Number(account.id));
  const latestSnapshotAtMs = useValuation ? selectLatestSnapshotTimestampMs(database, sortedAccountIds) : null;
  const hasSnapshots = useValuation && latestSnapshotAtMs !== null;
  const daysSinceLatestSnapshot = hasSnapshots
    ? elapsedDaysBetweenUnixTimestampMilliseconds(latestSnapshotAtMs, Date.now())
    : null;
  const latestValuationValueByAccountId = hasSnapshots
    ? new Map(selectLatestValuationByAccountIds(
      database,
      sortedAccountIds,
    ).map((row) => [Number(row.account_id), Number(row.value_cents)]))
    : new Map();
  const valuedBalanceByAccountId = new Map();
  let netWorthValuedCents = null;
  let valuedTotalCents = 0;
  let liquidAssetsCents = 0;
  let investmentsCents = 0;

  for (const account of sortedAccounts) {
    const accountId = Number(account.id);
    const accountLedgerBalanceCents = Number(netWorthByAccountId.get(accountId) ?? 0);
    const latestSnapshotValueCents = latestValuationValueByAccountId.get(accountId);
    const accountValuedBalanceCents = latestSnapshotValueCents === undefined
      ? accountLedgerBalanceCents
      : latestSnapshotValueCents;
    valuedBalanceByAccountId.set(accountId, accountValuedBalanceCents);

    if (hasSnapshots) {
      valuedTotalCents += accountValuedBalanceCents;
    }

    const accountNetWorthCents = hasSnapshots ? accountValuedBalanceCents : accountLedgerBalanceCents;
    if (LIQUID_ACCOUNT_TYPES.has(account.type)) {
      liquidAssetsCents += accountNetWorthCents;
    }
    if (INVESTMENT_ACCOUNT_TYPES.has(account.type)) {
      investmentsCents += accountNetWorthCents;
    }
  }

  if (hasSnapshots) {
    netWorthValuedCents = valuedTotalCents;
  }

  const netWorthCents = hasSnapshots ? valuedTotalCents : currentTotalCents;

  return {
    rows: sortedAccounts.map((account) => {
      const accountId = Number(account.id);

      return {
        account_id: accountId,
        account_name: account.name,
        account_type: account.type,
        net_worth_cents: netWorthByAccountId.get(accountId) ?? 0,
        net_worth_valued_cents: hasSnapshots
          ? (valuedBalanceByAccountId.get(accountId) ?? (netWorthByAccountId.get(accountId) ?? 0))
          : null,
      };
    }),
    netWorthLedgerCents: currentTotalCents,
    netWorthValuedCents,
    netWorthCents,
    netWorthMode: hasSnapshots ? 'valued' : 'ledger',
    liquidAssetsCents,
    investmentsCents,
    snapshots: {
      hasSnapshots,
      latestSnapshotAtMs,
      daysSinceLatestSnapshot,
      isOutdated: hasSnapshots
        && daysSinceLatestSnapshot !== null
        && daysSinceLatestSnapshot > SNAPSHOT_OUTDATED_DAYS_THRESHOLD,
    },
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

function toCompareCategoryRows(rows, monthKey, options = {}) {
  const useAbsoluteAmount = Boolean(options.absoluteAmount);

  return rows
    .filter((row) => row?.month === monthKey)
    .map((row) => {
      const rawAmountCents = Number(row.total_cents ?? 0);
      const amountCents = useAbsoluteAmount ? Math.abs(rawAmountCents) : rawAmountCents;

      return {
        category_id: Number(row.category_id),
        category_name: String(row.category_name ?? ''),
        amount_cents: amountCents,
      };
    })
    .filter((row) => Number(row.amount_cents) > 0)
    .sort((left, right) => {
      const amountComparison = Number(right.amount_cents) - Number(left.amount_cents);
      if (amountComparison !== 0) {
        return amountComparison;
      }

      return String(left.category_name).localeCompare(String(right.category_name));
    });
}

function dailyTotalsByDate(filters = {}) {
  const database = getDatabase();
  const filterContext = resolveFilterContext(database, filters);
  const rows = selectTransactions(
    database,
    buildTransactionsWhere(filters, filterContext, { excludeTransfers: true }),
    TRANSACTION_ASC_ORDER,
  );
  const totalsByDate = new Map();

  for (const row of rows) {
    const category = filterContext.categoryById.get(Number(row.category_id));
    if (!category || category.type === 'exclude') {
      continue;
    }

    const amountCents = Number(row.amount_cents ?? 0);
    if (amountCents === 0) {
      continue;
    }

    const date = formatUnixTimestampMillisecondsToDate(row.occurred_at, { format: 'YYYY-MM-DD' });
    const currentDate = totalsByDate.get(date) ?? {
      date,
      expenses_cents: 0,
      incomes_cents: 0,
      net_cashflow_cents: 0,
    };

    if (category.type === 'expense') {
      currentDate.expenses_cents += Math.abs(amountCents);
    } else if (category.type === 'income') {
      currentDate.incomes_cents += amountCents;
    }

    currentDate.net_cashflow_cents = currentDate.incomes_cents - currentDate.expenses_cents;
    totalsByDate.set(date, currentDate);
  }

  return Array.from(totalsByDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

function transactionsByCategoryAndMonth(filters, categoryType) {
  const database = getDatabase();
  const filterContext = resolveFilterContext(database, filters);
  const rows = selectTransactions(
    database,
    buildTransactionsWhere(filters, filterContext, { excludeTransfers: true }),
    TRANSACTION_ASC_ORDER,
  );

  return {
    rows: aggregateByCategoryAndMonth(rows, filterContext, categoryType),
  };
}

function expensesByCategoryByMonth(filters = {}) {
  return transactionsByCategoryAndMonth(filters, 'expense');
}

function incomesByCategoryByMonth(filters = {}) {
  return transactionsByCategoryAndMonth(filters, 'income');
}

function moneyFlowSankeyByMonth(filters = {}) {
  const database = getDatabase();
  const filterContext = resolveFilterContext(database, filters);
  const transactionRows = selectTransactions(
    database,
    buildTransactionsWhere(filters, filterContext, { excludeTransfers: true }),
    TRANSACTION_ASC_ORDER,
  );

  let incomesTotalCents = 0;
  let expensesNetTotalCents = 0;
  const expenseTotalsByCategoryId = new Map();

  for (const row of transactionRows) {
    const categoryId = Number(row.category_id);
    const category = filterContext.categoryById.get(categoryId);
    if (!category) {
      continue;
    }

    const amountCents = Number(row.amount_cents ?? 0);
    if (amountCents === 0) {
      continue;
    }

    if (category.type === 'income') {
      // Match the monthly bar chart logic: income totals are net sums for income-type categories.
      incomesTotalCents += amountCents;
      continue;
    }

    if (category.type !== 'expense') {
      continue;
    }

    // Match the monthly bar chart logic: expenses are first aggregated as net sums
    // for expense-type categories, then converted to magnitude for Sankey links.
    expensesNetTotalCents += amountCents;

    const currentEntry = expenseTotalsByCategoryId.get(categoryId) ?? {
      category_id: categoryId,
      category_name: category.name,
      total_cents: 0,
    };
    currentEntry.total_cents += amountCents;
    expenseTotalsByCategoryId.set(categoryId, currentEntry);
  }

  let savingsTotalCents = 0;
  let investmentsTotalCents = 0;
  let cryptoTotalCents = 0;

  let transferRows = selectTransfers(database, buildTransfersWhere(filters), TRANSFER_ORDER);
  if (filterContext.hasAccountFilter) {
    const allowedAccountIds = new Set(filterContext.filteredAccountIds.map(Number));
    transferRows = transferRows.filter((row) => (
      allowedAccountIds.has(Number(row.from_account_id)) ||
      allowedAccountIds.has(Number(row.to_account_id))
    ));
  }

  for (const row of transferRows) {
    const fromAccount = filterContext.accountById.get(Number(row.from_account_id));
    const toAccount = filterContext.accountById.get(Number(row.to_account_id));
    if (!fromAccount || !toAccount) {
      continue;
    }

    const amountCents = Math.abs(Number(row.amount_cents ?? 0));
    if (amountCents === 0) {
      continue;
    }

    const isSourceLiquidAccount = fromAccount.type === 'bank' || fromAccount.type === 'cash';

    if (isSourceLiquidAccount && toAccount.type === 'savings') {
      savingsTotalCents += amountCents;
      continue;
    }

    if (isSourceLiquidAccount && toAccount.type === 'brokerage') {
      investmentsTotalCents += amountCents;
      continue;
    }

    if (toAccount.type === 'crypto') {
      cryptoTotalCents += amountCents;
    }
  }

  const expensesTotalCents = Math.abs(expensesNetTotalCents);
  const expenseByCategory = buildMoneyFlowExpenseByCategory(expenseTotalsByCategoryId, expensesTotalCents);
  // Net cashflow is the monthly net result and must match the bar chart definition.
  const netCashflowTotalCents = incomesTotalCents - expensesTotalCents;

  return {
    totals: {
      incomes_cents: incomesTotalCents,
      expenses_cents: expensesTotalCents,
      savings_cents: savingsTotalCents,
      investments_cents: investmentsTotalCents,
      crypto_cents: cryptoTotalCents,
      net_cashflow_cents: netCashflowTotalCents,
    },
    expense_by_category: expenseByCategory,
    // Backward-compatible alias while frontend migrates.
    expense_categories: expenseByCategory,
  };
}

function buildCompareMonthSnapshot(selection) {
  const period = toMonthRangeFromSelection(selection);
  const monthFilters = {
    date_from: period.from,
    date_to: period.to,
  };

  const moneyFlowTotals = moneyFlowSankeyByMonth(monthFilters)?.totals ?? {
    incomes_cents: 0,
    expenses_cents: 0,
    savings_cents: 0,
    investments_cents: 0,
    crypto_cents: 0,
    net_cashflow_cents: 0,
  };
  const netWorth = netWorthByAccount({
    date_to: period.to,
    useValuation: true,
  });
  const expensesByCategory = expensesByCategoryByMonth(monthFilters);
  const incomesByCategory = incomesByCategoryByMonth(monthFilters);
  const dailyTotals = dailyTotalsByDate(monthFilters);

  return {
    period,
    totals: moneyFlowTotals,
    net_worth: netWorth,
    expenses_by_category: toCompareCategoryRows(expensesByCategory.rows, period.month_key, { absoluteAmount: true }),
    incomes_by_category: toCompareCategoryRows(incomesByCategory.rows, period.month_key),
    daily_totals: dailyTotals,
  };
}

function compareMonths(payload) {
  return {
    left: buildCompareMonthSnapshot(payload.left),
    right: buildCompareMonthSnapshot(payload.right),
  };
}

function budgetVsExpensesByCategoryByYear(year) {
  const database = getDatabase();
  const period = toYearRange(year);
  const budgetRows = selectRows(
    database,
    'budgets',
    {
      archived: 0,
      created_at: {
        gte: period.from,
        lte: period.to,
      },
    },
    {
      orderBy: [
        { column: 'category_id', direction: 'ASC' },
        { column: 'id', direction: 'ASC' },
      ],
    },
  );

  if (budgetRows.length === 0) {
    return {
      year: period.year,
      rows: [],
      totals: {
        budget_amount_cents: 0,
        expenses_total_cents: 0,
        delta_cents: 0,
      },
    };
  }

  const categoryIds = Array.from(new Set(
    budgetRows
      .map((row) => Number(row.category_id))
      .filter((categoryId) => Number.isInteger(categoryId) && categoryId > 0),
  ));
  if (categoryIds.length === 0) {
    return {
      year: period.year,
      rows: [],
      totals: {
        budget_amount_cents: 0,
        expenses_total_cents: 0,
        delta_cents: 0,
      },
    };
  }

  const categories = selectRows(database, 'categories', {
    id: { in: categoryIds },
  });
  const categoryById = new Map(categories.map((category) => [Number(category.id), category]));
  const expenseCategoryIds = categoryIds.filter((categoryId) => categoryById.get(categoryId)?.type === 'expense');
  const expenseCategoryIdsSet = new Set(expenseCategoryIds);

  if (expenseCategoryIds.length === 0) {
    return {
      year: period.year,
      rows: [],
      totals: {
        budget_amount_cents: 0,
        expenses_total_cents: 0,
        delta_cents: 0,
      },
    };
  }

  const expenseTransactions = selectRows(
    database,
    'transactions',
    {
      category_id: { in: expenseCategoryIds },
      occurred_at: {
        gte: period.from,
        lte: period.to,
      },
      transfer_id: { isNull: true },
    },
    { orderBy: TRANSACTION_ASC_ORDER },
  );
  const netExpensesByCategoryId = new Map();

  for (const row of expenseTransactions) {
    const categoryId = Number(row.category_id);
    if (!expenseCategoryIdsSet.has(categoryId)) {
      continue;
    }

    const amountCents = Number(row.amount_cents ?? 0);
    if (!Number.isFinite(amountCents) || amountCents === 0) {
      continue;
    }

    netExpensesByCategoryId.set(categoryId, (netExpensesByCategoryId.get(categoryId) ?? 0) + amountCents);
  }

  const rows = budgetRows
    .map((budgetRow) => {
      const categoryId = Number(budgetRow.category_id);
      const category = categoryById.get(categoryId);
      if (!category || category.type !== 'expense') {
        return null;
      }

      const budgetAmountCents = Math.max(0, Number(budgetRow.amount_cents ?? 0));
      const expensesTotalCents = Math.max(0, Math.abs(Number(netExpensesByCategoryId.get(categoryId) ?? 0)));

      return {
        budget_id: Number(budgetRow.id),
        year: period.year,
        category_id: categoryId,
        category_name: String(category.name ?? ''),
        budget_amount_cents: budgetAmountCents,
        expenses_total_cents: expensesTotalCents,
        delta_cents: budgetAmountCents - expensesTotalCents,
      };
    })
    .filter((row) => row !== null);

  const budgetAmountTotalCents = rows.reduce((total, row) => total + Number(row.budget_amount_cents), 0);
  const expensesTotalCents = rows.reduce((total, row) => total + Number(row.expenses_total_cents), 0);

  return {
    year: period.year,
    rows,
    totals: {
      budget_amount_cents: budgetAmountTotalCents,
      expenses_total_cents: expensesTotalCents,
      delta_cents: budgetAmountTotalCents - expensesTotalCents,
    },
  };
}

module.exports = {
  availableYears,
  budgetVsExpensesByCategoryByYear,
  compareMonths,
  expensesIncomesNetCashflowByMonth,
  receivablesPayables,
  netWorthByAccount,
  expensesByCategoryByMonth,
  incomesByCategoryByMonth,
  moneyFlowSankeyByMonth,
};
