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
    listActive: 'db:accounts:list-active',
  }),
  categories: Object.freeze({
    create: 'db:categories:create',
    get: 'db:categories:get',
    list: 'db:categories:list',
    update: 'db:categories:update',
    remove: 'db:categories:remove',
    listByType: 'db:categories:list-by-type',
    listByParent: 'db:categories:list-by-parent',
    listRoot: 'db:categories:list-root',
  }),
  transactions: Object.freeze({
    create: 'db:transactions:create',
    get: 'db:transactions:get',
    list: 'db:transactions:list',
    update: 'db:transactions:update',
    remove: 'db:transactions:remove',
    listByAccount: 'db:transactions:list-by-account',
    listByCategory: 'db:transactions:list-by-category',
    listByDateRange: 'db:transactions:list-by-date-range',
    listUnsettled: 'db:transactions:list-unsettled',
  }),
});

module.exports = {
  CHANNELS,
};
