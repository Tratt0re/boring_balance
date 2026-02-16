const { deleteRows, getDatabase, selectRows } = require('../../database');
const { randomUUID } = require('node:crypto');
const { createBaseModel } = require('../base-model');
const { TRANSFER_CATEGORY_ID } = require('./constants');
const { EMPTY_TAGS_JSON, normalizeRowsTags, normalizeRowTags } = require('./tags');

const transactionsBaseModel = createBaseModel('transactions');

function buildOccurredAtFilter(filters = {}) {
  const occurredAtFilter = {};

  if (filters.date_from !== undefined) {
    occurredAtFilter.gte = filters.date_from;
  }

  if (filters.date_to !== undefined) {
    occurredAtFilter.lte = filters.date_to;
  }

  return Object.keys(occurredAtFilter).length === 0 ? undefined : occurredAtFilter;
}

function buildListWhere(filters = {}) {
  const where = {
    category_id: TRANSFER_CATEGORY_ID,
  };

  const occurredAtFilter = buildOccurredAtFilter(filters);
  if (occurredAtFilter) {
    where.occurred_at = occurredAtFilter;
  }

  if (Array.isArray(filters.accounts)) {
    where.account_id = { in: filters.accounts };
  }

  return where;
}

function list(filters = {}) {
  const rows = transactionsBaseModel.list(buildListWhere(filters), {
    orderBy: [
      { column: 'occurred_at', direction: 'DESC' },
      { column: 'id', direction: 'DESC' },
    ],
  });

  return normalizeRowsTags(rows);
}

function create(payload) {
  const database = getDatabase();
  const createTransferTx = database.transaction((transferPayload) => {
    const transferId = randomUUID();

    const outgoingTransferRow = {
      account_id: transferPayload.from_account_id,
      category_id: TRANSFER_CATEGORY_ID,
      occurred_at: transferPayload.occurred_at,
      amount_cents: -Math.abs(transferPayload.amount_cents),
      description: null,
      tags: EMPTY_TAGS_JSON,
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
      tags: EMPTY_TAGS_JSON,
      transfer_id: transferId,
      settled: 1,
      created_at: transferPayload.created_at,
    };

    const outgoingTransferId = Number(transactionsBaseModel.create(outgoingTransferRow));
    const incomingTransferId = Number(transactionsBaseModel.create(incomingTransferRow));
    const outgoingTransfer = normalizeRowTags(transactionsBaseModel.getById(outgoingTransferId));
    const incomingTransfer = normalizeRowTags(transactionsBaseModel.getById(incomingTransferId));

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

function update(payload) {
  const database = getDatabase();
  const updateTransferTx = database.transaction((transferPayload) => {
    const transferRows = selectRows(
      database,
      'transactions',
      {
        transfer_id: transferPayload.transfer_id,
        category_id: TRANSFER_CATEGORY_ID,
      },
      { orderBy: 'id', orderDirection: 'ASC' },
    );

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
      tags: EMPTY_TAGS_JSON,
      settled: 1,
      updated_at: transferPayload.updated_at,
    };

    const incomingChanges = {
      account_id: transferPayload.to_account_id,
      category_id: TRANSFER_CATEGORY_ID,
      occurred_at: transferPayload.occurred_at,
      amount_cents: Math.abs(transferPayload.amount_cents),
      description: null,
      tags: EMPTY_TAGS_JSON,
      settled: 1,
      updated_at: transferPayload.updated_at,
    };

    transactionsBaseModel.updateById(outgoingTransfer.id, outgoingChanges);
    transactionsBaseModel.updateById(incomingTransfer.id, incomingChanges);

    const updatedOutgoingTransfer = normalizeRowTags(
      transactionsBaseModel.getById(Number(outgoingTransfer.id)),
    );
    const updatedIncomingTransfer = normalizeRowTags(
      transactionsBaseModel.getById(Number(incomingTransfer.id)),
    );
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

function remove(payload) {
  const database = getDatabase();
  const deleteTransferTx = database.transaction((transferPayload) => {
    const changed = deleteRows(database, 'transactions', {
      transfer_id: transferPayload.transfer_id,
      category_id: TRANSFER_CATEGORY_ID,
    });

    return { changed };
  });

  return deleteTransferTx(payload);
}

module.exports = {
  list,
  create,
  update,
  remove,
};
