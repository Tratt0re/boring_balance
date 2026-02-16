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
