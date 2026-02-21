const appMetaController = require('./app-meta.controller');
const accountsController = require('./accounts.controller');
const categoriesController = require('./categories.controller');
const analyticsController = require('./analytics.controller');
const { transactionsController, transfersController } = require('./transactions');

module.exports = {
  appMetaController,
  accountsController,
  categoriesController,
  analyticsController,
  transactionsController,
  transfersController,
};
