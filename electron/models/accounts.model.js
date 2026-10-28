const { countRows, getDatabase } = require('../database');
const { createBaseModel } = require('./base-model');

const accountsBaseModel = createBaseModel('accounts');

/** How many rows of each kind still point at the account (a foreign key would refuse its deletion). */
function countReferences(accountId) {
  const database = getDatabase();

  return {
    transactions: countRows(database, 'transactions', { account_id: accountId }),
    transfers:
      countRows(database, 'transfers', { from_account_id: accountId }) +
      countRows(database, 'transfers', { to_account_id: accountId }),
    valuations: countRows(database, 'account_valuations', { account_id: accountId }),
  };
}

module.exports = {
  ...accountsBaseModel,
  countReferences,
};
