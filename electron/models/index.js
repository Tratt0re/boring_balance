const appMetaModel = require('./app-meta.model');
const accountsModel = require('./accounts.model');
const categoriesModel = require('./categories.model');
const analyticsModel = require('./analytics.model');
const planItemsModel = require('./plan-items.model');
const { transactionsModel, transfersModel } = require('./transactions');

module.exports = {
  appMetaModel,
  accountsModel,
  categoriesModel,
  analyticsModel,
  planItemsModel,
  transactionsModel,
  transfersModel,
};
