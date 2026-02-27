const appMetaModel = require('./app-meta.model');
const accountsModel = require('./accounts.model');
const categoriesModel = require('./categories.model');
const budgetsModel = require('./budgets.model');
const analyticsModel = require('./analytics.model');
const planItemsModel = require('./plan-items.model');
const backupModel = require('./backup.model');
const { transactionsModel, transfersModel } = require('./transactions');

module.exports = {
  appMetaModel,
  accountsModel,
  categoriesModel,
  budgetsModel,
  analyticsModel,
  planItemsModel,
  backupModel,
  transactionsModel,
  transfersModel,
};
