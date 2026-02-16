const appMetaModel = require('./app-meta.model');
const accountsModel = require('./accounts.model');
const categoriesModel = require('./categories.model');
const { transactionsModel, transfersModel } = require('./transactions');

module.exports = {
  appMetaModel,
  accountsModel,
  categoriesModel,
  transactionsModel,
  transfersModel,
};
