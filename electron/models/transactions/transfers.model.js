const { countRows, deleteRows, getDatabase, selectRows } = require('../../database');
const { randomUUID } = require('node:crypto');
const { createBaseModel } = require('../base-model');
const { TRANSFER_CATEGORY_ID } = require('./constants');
const { EMPTY_TAGS_JSON, normalizeRowTags } = require('./tags');

const transactionsBaseModel = createBaseModel('transactions');
const transfersBaseModel = createBaseModel('transfers');
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;

function buildFilteredTransferWhereClause(filters = {}) {
  const where = {};
  const occurredAtFilter = {};
  const amountCentsFilter = {};

  if (filters.date_from !== undefined) {
    occurredAtFilter.gte = filters.date_from;
  }

  if (filters.date_to !== undefined) {
    occurredAtFilter.lte = filters.date_to;
  }

  if (filters.amount_from !== undefined) {
    amountCentsFilter.gte = filters.amount_from;
  }

  if (filters.amount_to !== undefined) {
    amountCentsFilter.lte = filters.amount_to;
  }

  if (Object.keys(occurredAtFilter).length > 0) {
    where.occurred_at = occurredAtFilter;
  }

  if (Object.keys(amountCentsFilter).length > 0) {
    where.amount_cents = amountCentsFilter;
  }

  if (filters.settled !== undefined) {
    where.settled = filters.settled;
  }

  return where;
}

function hasAccountsFilter(filters = {}) {
  return Array.isArray(filters.accounts);
}

function toAccountsFilterSet(filters = {}) {
  if (!hasAccountsFilter(filters)) {
    return null;
  }

  return new Set(filters.accounts.map((accountId) => Number(accountId)));
}

function matchesAccountsFilter(row, accountsFilterSet) {
  if (!accountsFilterSet) {
    return true;
  }

  return (
    accountsFilterSet.has(Number(row.from_account_id)) ||
    accountsFilterSet.has(Number(row.to_account_id))
  );
}

function countFilteredTransfers(database, filters = {}) {
  if (hasAccountsFilter(filters)) {
    const accountsFilterSet = toAccountsFilterSet(filters);
    if (!accountsFilterSet || accountsFilterSet.size === 0) {
      return 0;
    }

    const rows = selectRows(database, 'transfers', buildFilteredTransferWhereClause(filters), {
      orderBy: [
        { column: 'occurred_at', direction: 'DESC' },
        { column: 'id', direction: 'DESC' },
      ],
    });

    return rows.filter((row) => matchesAccountsFilter(row, accountsFilterSet)).length;
  }

  return countRows(database, 'transfers', buildFilteredTransferWhereClause(filters));
}

function listFilteredTransferRows(database, filters = {}, pagination = {}) {
  const where = buildFilteredTransferWhereClause(filters);
  const orderBy = [
    { column: 'occurred_at', direction: 'DESC' },
    { column: 'id', direction: 'DESC' },
  ];

  if (hasAccountsFilter(filters)) {
    const accountsFilterSet = toAccountsFilterSet(filters);
    if (!accountsFilterSet || accountsFilterSet.size === 0) {
      return [];
    }

    const rows = selectRows(database, 'transfers', where, { orderBy });
    const filteredRows = rows.filter((row) => matchesAccountsFilter(row, accountsFilterSet));
    const offset = (pagination.page - 1) * pagination.page_size;

    return filteredRows.slice(offset, offset + pagination.page_size);
  }

  return selectRows(database, 'transfers', where, {
    orderBy,
    limit: pagination.page_size,
    offset: (pagination.page - 1) * pagination.page_size,
  });
}

function normalizePagination(pagination = {}) {
  const page = Number.isInteger(pagination.page) && pagination.page > 0 ? pagination.page : DEFAULT_PAGE;
  const pageSize =
    Number.isInteger(pagination.page_size) && pagination.page_size > 0
      ? pagination.page_size
      : DEFAULT_PAGE_SIZE;

  return {
    page,
    page_size: pageSize,
  };
}

function list(filters = {}, pagination = {}) {
  const normalizedPagination = normalizePagination(pagination);
  const database = getDatabase();
  const totalTransfers = countFilteredTransfers(database, filters);
  const totalPages =
    totalTransfers === 0
      ? DEFAULT_PAGE
      : Math.max(DEFAULT_PAGE, Math.ceil(totalTransfers / normalizedPagination.page_size));
  const page = Math.min(normalizedPagination.page, totalPages);
  if (totalTransfers === 0) {
    return {
      rows: [],
      total: totalTransfers,
      page,
      page_size: normalizedPagination.page_size,
    };
  }

  const rows = listFilteredTransferRows(database, filters, {
    page,
    page_size: normalizedPagination.page_size,
  });

  return {
    rows,
    total: totalTransfers,
    page,
    page_size: normalizedPagination.page_size,
  };
}

function create(payload) {
  const database = getDatabase();
  const createTransferTx = database.transaction((transferPayload) => {
    const transferId = randomUUID();
    const settled = transferPayload.settled === undefined ? 1 : Number(transferPayload.settled);
    const transferRow = {
      id: transferId,
      from_account_id: transferPayload.from_account_id,
      to_account_id: transferPayload.to_account_id,
      occurred_at: transferPayload.occurred_at,
      amount_cents: Math.abs(transferPayload.amount_cents),
      description: transferPayload.description ?? null,
      settled,
      created_at: transferPayload.created_at,
    };
    transfersBaseModel.create(transferRow);

    const outgoingTransferRow = {
      account_id: transferPayload.from_account_id,
      category_id: TRANSFER_CATEGORY_ID,
      occurred_at: transferPayload.occurred_at,
      amount_cents: -Math.abs(transferPayload.amount_cents),
      description: null,
      tags: EMPTY_TAGS_JSON,
      transfer_id: transferId,
      settled,
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
      settled,
      created_at: transferPayload.created_at,
    };

    const outgoingTransferId = Number(transactionsBaseModel.create(outgoingTransferRow));
    const incomingTransferId = Number(transactionsBaseModel.create(incomingTransferRow));
    const createdTransfer = transfersBaseModel.getById(transferId);
    const outgoingTransfer = normalizeRowTags(transactionsBaseModel.getById(outgoingTransferId));
    const incomingTransfer = normalizeRowTags(transactionsBaseModel.getById(incomingTransferId));

    if (!createdTransfer || !outgoingTransfer || !incomingTransfer) {
      throw new Error('Failed to retrieve created transfer rows.');
    }

    return {
      transfer_id: transferId,
      transfer: createdTransfer,
      transactions: [outgoingTransfer, incomingTransfer],
    };
  });

  return createTransferTx(payload);
}

function update(payload) {
  const database = getDatabase();
  const updateTransferTx = database.transaction((transferPayload) => {
    const transferRecord = transfersBaseModel.getById(transferPayload.transfer_id);
    if (!transferRecord) {
      throw new Error(`Transfer not found for transfer_id "${transferPayload.transfer_id}".`);
    }

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
      throw new Error(`Transfer transactions not found for transfer_id "${transferPayload.transfer_id}".`);
    }

    const settled =
      transferPayload.settled === undefined
        ? Number(transferRecord.settled ?? 1)
        : Number(transferPayload.settled);

    transfersBaseModel.updateById(transferPayload.transfer_id, {
      from_account_id: transferPayload.from_account_id,
      to_account_id: transferPayload.to_account_id,
      occurred_at: transferPayload.occurred_at,
      amount_cents: Math.abs(transferPayload.amount_cents),
      description: transferPayload.description ?? null,
      settled,
      updated_at: transferPayload.updated_at,
    });

    const outgoingChanges = {
      account_id: transferPayload.from_account_id,
      category_id: TRANSFER_CATEGORY_ID,
      occurred_at: transferPayload.occurred_at,
      amount_cents: -Math.abs(transferPayload.amount_cents),
      description: null,
      tags: EMPTY_TAGS_JSON,
      settled,
      updated_at: transferPayload.updated_at,
    };

    const incomingChanges = {
      account_id: transferPayload.to_account_id,
      category_id: TRANSFER_CATEGORY_ID,
      occurred_at: transferPayload.occurred_at,
      amount_cents: Math.abs(transferPayload.amount_cents),
      description: null,
      tags: EMPTY_TAGS_JSON,
      settled,
      updated_at: transferPayload.updated_at,
    };

    transactionsBaseModel.updateById(outgoingTransfer.id, outgoingChanges);
    transactionsBaseModel.updateById(incomingTransfer.id, incomingChanges);

    const updatedTransfer = transfersBaseModel.getById(transferPayload.transfer_id);
    const updatedOutgoingTransfer = normalizeRowTags(
      transactionsBaseModel.getById(Number(outgoingTransfer.id)),
    );
    const updatedIncomingTransfer = normalizeRowTags(
      transactionsBaseModel.getById(Number(incomingTransfer.id)),
    );
    if (!updatedTransfer || !updatedOutgoingTransfer || !updatedIncomingTransfer) {
      throw new Error('Failed to retrieve updated transfer rows.');
    }

    return {
      transfer_id: transferPayload.transfer_id,
      transfer: updatedTransfer,
      transactions: [updatedOutgoingTransfer, updatedIncomingTransfer],
    };
  });

  return updateTransferTx(payload);
}

function remove(payload) {
  const database = getDatabase();
  const deleteTransferTx = database.transaction((transferPayload) => {
    const transactionChanges = deleteRows(database, 'transactions', {
      transfer_id: transferPayload.transfer_id,
      category_id: TRANSFER_CATEGORY_ID,
    });
    const transferChanges = deleteRows(database, 'transfers', {
      id: transferPayload.transfer_id,
    });

    return {
      changed: transferChanges > 0 ? transferChanges : transactionChanges,
    };
  });

  return deleteTransferTx(payload);
}

module.exports = {
  list,
  create,
  update,
  remove,
};
