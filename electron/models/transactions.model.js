const { getDatabase } = require('../database');
const { randomUUID } = require('node:crypto');
const { createBaseModel } = require('./base-model');

const transactionsBaseModel = createBaseModel('transactions');
const TRANSFER_CATEGORY_ID = 2;

function appendInClause(whereClauses, params, columnName, values) {
  if (!Array.isArray(values)) {
    return;
  }

  if (values.length === 0) {
    whereClauses.push('1 = 0');
    return;
  }

  const placeholders = values.map(() => '?').join(', ');
  whereClauses.push(`"${columnName}" IN (${placeholders})`);
  params.push(...values);
}

function buildListTransactionsWhereClause(filters = {}) {
  const whereClauses = [];
  const params = [];

  whereClauses.push('"category_id" != ?');
  params.push(TRANSFER_CATEGORY_ID);

  if (filters.date_from !== undefined) {
    whereClauses.push('"occurred_at" >= ?');
    params.push(filters.date_from);
  }

  if (filters.date_to !== undefined) {
    whereClauses.push('"occurred_at" <= ?');
    params.push(filters.date_to);
  }

  appendInClause(whereClauses, params, 'category_id', filters.categories);
  appendInClause(whereClauses, params, 'account_id', filters.accounts);

  if (filters.settled !== undefined) {
    whereClauses.push('"settled" = ?');
    params.push(filters.settled);
  }

  return {
    whereSql: ` WHERE ${whereClauses.join(' AND ')}`,
    params,
  };
}

function buildListTransfersWhereClause(filters = {}) {
  const whereClauses = [];
  const params = [];

  whereClauses.push('"category_id" = ?');
  params.push(TRANSFER_CATEGORY_ID);

  if (filters.date_from !== undefined) {
    whereClauses.push('"occurred_at" >= ?');
    params.push(filters.date_from);
  }

  if (filters.date_to !== undefined) {
    whereClauses.push('"occurred_at" <= ?');
    params.push(filters.date_to);
  }

  appendInClause(whereClauses, params, 'account_id', filters.accounts);

  return {
    whereSql: ` WHERE ${whereClauses.join(' AND ')}`,
    params,
  };
}

function listTransactions(filters = {}) {
  const database = getDatabase();
  const { whereSql, params } = buildListTransactionsWhereClause(filters);
  const sql = `SELECT * FROM "transactions"${whereSql} ORDER BY "occurred_at" DESC, "id" DESC`;

  return database.prepare(sql).all(params);
}

function listTransfers(filters = {}) {
  const database = getDatabase();
  const { whereSql, params } = buildListTransfersWhereClause(filters);
  const sql = `SELECT * FROM "transactions"${whereSql} ORDER BY "occurred_at" DESC, "id" DESC`;

  return database.prepare(sql).all(params);
}

function createTransfer(payload) {
  const database = getDatabase();
  const createTransferTx = database.transaction((transferPayload) => {
    const transferId = randomUUID();

    const outgoingTransferRow = {
      account_id: transferPayload.from_account_id,
      category_id: TRANSFER_CATEGORY_ID,
      occurred_at: transferPayload.occurred_at,
      amount_cents: -Math.abs(transferPayload.amount_cents),
      description: null,
      notes: null,
      transfer_id: transferId,
      settled: 1,
      created_at: transferPayload.created_at,
    };

    const incomingTransferRow = {
      account_id: transferPayload.to_account_id,
      category_id: TRANSFER_CATEGORY_ID,
      occurred_at: transferPayload.occurred_at,
      amount_cents: Math.abs(transferPayload.amount_cents),
      description: null,
      notes: null,
      transfer_id: transferId,
      settled: 1,
      created_at: transferPayload.created_at,
    };

    const outgoingTransferId = Number(transactionsBaseModel.create(outgoingTransferRow));
    const incomingTransferId = Number(transactionsBaseModel.create(incomingTransferRow));
    const outgoingTransfer = transactionsBaseModel.getById(outgoingTransferId);
    const incomingTransfer = transactionsBaseModel.getById(incomingTransferId);

    if (!outgoingTransfer || !incomingTransfer) {
      throw new Error('Failed to retrieve created transfer rows.');
    }

    return {
      transfer_id: transferId,
      transactions: [outgoingTransfer, incomingTransfer],
    };
  });

  return createTransferTx(payload);
}

function updateTransfer(payload) {
  const database = getDatabase();
  const updateTransferTx = database.transaction((transferPayload) => {
    const transferRows = database
      .prepare(
        'SELECT * FROM "transactions" WHERE "transfer_id" = ? AND "category_id" = ? ORDER BY "id" ASC',
      )
      .all(transferPayload.transfer_id, TRANSFER_CATEGORY_ID);

    const outgoingTransfer = transferRows.find((row) => Number(row.amount_cents) < 0);
    const incomingTransfer = transferRows.find((row) => Number(row.amount_cents) > 0);
    if (!outgoingTransfer || !incomingTransfer) {
      throw new Error(`Transfer not found for transfer_id "${transferPayload.transfer_id}".`);
    }

    const outgoingChanges = {
      account_id: transferPayload.from_account_id,
      category_id: TRANSFER_CATEGORY_ID,
      occurred_at: transferPayload.occurred_at,
      amount_cents: -Math.abs(transferPayload.amount_cents),
      description: null,
      notes: null,
      settled: 1,
      updated_at: transferPayload.updated_at,
    };

    const incomingChanges = {
      account_id: transferPayload.to_account_id,
      category_id: TRANSFER_CATEGORY_ID,
      occurred_at: transferPayload.occurred_at,
      amount_cents: Math.abs(transferPayload.amount_cents),
      description: null,
      notes: null,
      settled: 1,
      updated_at: transferPayload.updated_at,
    };

    transactionsBaseModel.updateById(outgoingTransfer.id, outgoingChanges);
    transactionsBaseModel.updateById(incomingTransfer.id, incomingChanges);

    const updatedOutgoingTransfer = transactionsBaseModel.getById(Number(outgoingTransfer.id));
    const updatedIncomingTransfer = transactionsBaseModel.getById(Number(incomingTransfer.id));
    if (!updatedOutgoingTransfer || !updatedIncomingTransfer) {
      throw new Error('Failed to retrieve updated transfer rows.');
    }

    return {
      transfer_id: transferPayload.transfer_id,
      transactions: [updatedOutgoingTransfer, updatedIncomingTransfer],
    };
  });

  return updateTransferTx(payload);
}

function deleteTransfer(payload) {
  const database = getDatabase();
  const deleteTransferTx = database.transaction((transferPayload) => {
    const result = database
      .prepare('DELETE FROM "transactions" WHERE "transfer_id" = ? AND "category_id" = ?')
      .run(transferPayload.transfer_id, TRANSFER_CATEGORY_ID);

    return { changed: result.changes };
  });

  return deleteTransferTx(payload);
}

module.exports = {
  ...transactionsBaseModel,
  listTransactions,
  listTransfers,
  createTransfer,
  updateTransfer,
  deleteTransfer,
};
