const appMetaController = require('./app-meta.controller');
const accountsController = require('./accounts.controller');
const categoriesController = require('./categories.controller');
const { transactionsController, transfersController } = require('./transactions');

module.exports = {
  appMetaController,
  accountsController,
  categoriesController,
  transactionsController,
  transfersController,
};
