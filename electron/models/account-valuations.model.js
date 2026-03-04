const { createBaseModel } = require('./base-model');
const { getDatabase, selectRows } = require('../database');

const accountValuationsBaseModel = createBaseModel('account_valuations');

function listByAccount(accountId, options = {}) {
  return selectRows(getDatabase(), 'account_valuations', { account_id: accountId }, {
    orderBy: 'valued_at',
    orderDirection: 'DESC',
    limit: options.limit,
    offset: options.offset,
  });
}

function getLatestByAccount(accountId) {
  const rows = selectRows(getDatabase(), 'account_valuations', { account_id: accountId }, {
    orderBy: 'valued_at',
    orderDirection: 'DESC',
    limit: 1,
  });
  return rows[0] ?? null;
}

module.exports = {
  ...accountValuationsBaseModel,
  listByAccount,
  getLatestByAccount,
};
