const {
  appMetaController,
  accountsController,
  categoriesController,
  transactionsController,
} = require('../controllers');
const { CHANNELS } = require('./channels');

const IPC_HANDLERS = Object.freeze({
  [CHANNELS.appMeta.create]: appMetaController.create,
  [CHANNELS.appMeta.get]: appMetaController.get,
  [CHANNELS.appMeta.list]: appMetaController.list,
  [CHANNELS.appMeta.update]: appMetaController.update,
  [CHANNELS.appMeta.remove]: appMetaController.remove,
  [CHANNELS.appMeta.upsert]: appMetaController.upsert,

  [CHANNELS.accounts.create]: accountsController.create,
  [CHANNELS.accounts.get]: accountsController.get,
  [CHANNELS.accounts.list]: accountsController.list,
  [CHANNELS.accounts.update]: accountsController.update,
  [CHANNELS.accounts.remove]: accountsController.remove,
  [CHANNELS.accounts.listActive]: accountsController.listActive,

  [CHANNELS.categories.create]: categoriesController.create,
  [CHANNELS.categories.get]: categoriesController.get,
  [CHANNELS.categories.list]: categoriesController.list,
  [CHANNELS.categories.update]: categoriesController.update,
  [CHANNELS.categories.remove]: categoriesController.remove,
  [CHANNELS.categories.listByType]: categoriesController.listByType,
  [CHANNELS.categories.listByParent]: categoriesController.listByParent,
  [CHANNELS.categories.listRoot]: categoriesController.listRoot,

  [CHANNELS.transactions.create]: transactionsController.create,
  [CHANNELS.transactions.createTransfer]: transactionsController.createTransfer,
  [CHANNELS.transactions.updateTransfer]: transactionsController.updateTransfer,
  [CHANNELS.transactions.deleteTransfer]: transactionsController.deleteTransfer,
  [CHANNELS.transactions.get]: transactionsController.get,
  [CHANNELS.transactions.listTransactions]: transactionsController.listTransactions,
  [CHANNELS.transactions.listTransfers]: transactionsController.listTransfers,
  [CHANNELS.transactions.update]: transactionsController.update,
  [CHANNELS.transactions.remove]: transactionsController.remove,
});

module.exports = {
  IPC_HANDLERS,
};
