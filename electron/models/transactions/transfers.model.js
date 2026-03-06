const { countRows, deleteRows, getDatabase, selectRows } = require('../../database');
const { randomUUID } = require('node:crypto');
const { createBaseModel } = require('../base-model');
const { DEFAULT_PAGE, resolvePaginationWindow } = require('../pagination');
const { TRANSFER_CATEGORY_ID } = require('./constants');
const { buildDateRangeFilter } = require('../query-utils');
const { EMPTY_TAGS_JSON, normalizeRowTags } = require('./tags');

const transactionsBaseModel = createBaseModel('transactions');
const transfersBaseModel = createBaseModel('transfers');

function normalizeTransferRow(row) {
  if (!row) {
    return null;
  }

  const { plan_item_id: _ignoredPlanItemId, ...publicRow } = row;
  return publicRow;
}

function normalizeTransferRows(rows) {
  return rows.map((row) => normalizeTransferRow(row));
}

function buildFilteredTransferWhereClause(filters = {}) {
  const where = {};

  const occurredAtFilter = buildDateRangeFilter(filters.date_from, filters.date_to);
  if (occurredAtFilter) {
    where.occurred_at = occurredAtFilter;
  }

  const amountCentsFilter = {};
  if (filters.amount_from !== undefined) {
    amountCentsFilter.gte = filters.amount_from;
  }

  if (filters.amount_to !== undefined) {
    amountCentsFilter.lte = filters.amount_to;
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

function list(filters = {}, pagination = {}) {
  const database = getDatabase();
  const totalTransfers = countFilteredTransfers(database, filters);
  const paginationWindow = resolvePaginationWindow(totalTransfers, pagination, { defaultPage: DEFAULT_PAGE });
  if (totalTransfers === 0) {
    return {
      rows: [],
      total: totalTransfers,
      page: paginationWindow.page,
      page_size: paginationWindow.page_size,
    };
  }

  const rows = listFilteredTransferRows(database, filters, {
    page: paginationWindow.page,
    page_size: paginationWindow.page_size,
  });

  return {
    rows: normalizeTransferRows(rows),
    total: totalTransfers,
    page: paginationWindow.page,
    page_size: paginationWindow.page_size,
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
      ...(transferPayload.plan_item_id === undefined ? {} : { plan_item_id: transferPayload.plan_item_id }),
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
      ...(transferPayload.plan_item_id === undefined ? {} : { plan_item_id: transferPayload.plan_item_id }),
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
      ...(transferPayload.plan_item_id === undefined ? {} : { plan_item_id: transferPayload.plan_item_id }),
    };

    const outgoingTransferId = Number(transactionsBaseModel.create(outgoingTransferRow));
    const incomingTransferId = Number(transactionsBaseModel.create(incomingTransferRow));
    const createdTransfer = normalizeTransferRow(transfersBaseModel.getById(transferId));
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
      ...(transferPayload.plan_item_id === undefined ? {} : { plan_item_id: transferPayload.plan_item_id }),
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
      ...(transferPayload.plan_item_id === undefined ? {} : { plan_item_id: transferPayload.plan_item_id }),
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
      ...(transferPayload.plan_item_id === undefined ? {} : { plan_item_id: transferPayload.plan_item_id }),
      updated_at: transferPayload.updated_at,
    };

    transactionsBaseModel.updateById(outgoingTransfer.id, outgoingChanges);
    transactionsBaseModel.updateById(incomingTransfer.id, incomingChanges);

    const updatedTransfer = normalizeTransferRow(transfersBaseModel.getById(transferPayload.transfer_id));
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
