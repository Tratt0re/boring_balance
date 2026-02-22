const CHANNELS = Object.freeze({
  appMeta: Object.freeze({
    create: 'db:app-meta:create',
    get: 'db:app-meta:get',
    list: 'db:app-meta:list',
    update: 'db:app-meta:update',
    remove: 'db:app-meta:remove',
    upsert: 'db:app-meta:upsert',
  }),
  accounts: Object.freeze({
    create: 'db:accounts:create',
    get: 'db:accounts:get',
    list: 'db:accounts:list',
    update: 'db:accounts:update',
    remove: 'db:accounts:remove',
  }),
  categories: Object.freeze({
    create: 'db:categories:create',
    get: 'db:categories:get',
    list: 'db:categories:list',
    update: 'db:categories:update',
    remove: 'db:categories:remove',
  }),
  analytics: Object.freeze({
    expensesIncomesNetCashflowByMonth: 'db:analytics:expenses-incomes-net-cashflow-by-month',
    receivablesPayables: 'db:analytics:receivables-payables',
    netWorthByAccount: 'db:analytics:net-worth-by-account',
    expensesByCategoryByMonth: 'db:analytics:expenses-by-category-by-month',
    incomesByCategoryByMonth: 'db:analytics:incomes-by-category-by-month',
    moneyFlowSankeyByMonth: 'db:analytics:money-flow-sankey-by-month',
  }),
  transactions: Object.freeze({
    create: 'db:transactions:create',
    createTransfer: 'db:transactions:create-transfer',
    updateTransfer: 'db:transactions:update-transfer',
    deleteTransfer: 'db:transactions:delete-transfer',
    get: 'db:transactions:get',
    listTransactions: 'db:transactions:list-transactions',
    listTransfers: 'db:transactions:list-transfers',
    update: 'db:transactions:update',
    remove: 'db:transactions:remove',
  }),
});

module.exports = {
  CHANNELS,
};
