const appMetaController = require('./app-meta.controller');
const accountsController = require('./accounts.controller');
const categoriesController = require('./categories.controller');
const budgetsController = require('./budgets.controller');
const analyticsController = require('./analytics.controller');
const planItemsController = require('./plan-items.controller');
const backupController = require('./backup.controller');
const { transactionsController, transfersController } = require('./transactions');

module.exports = {
  appMetaController,
  accountsController,
  categoriesController,
  budgetsController,
  analyticsController,
  planItemsController,
  backupController,
  transactionsController,
  transfersController,
};
