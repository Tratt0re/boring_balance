const { deleteRows, getDatabase, selectRows } = require('../../database');
const { randomUUID } = require('node:crypto');
const { createBaseModel } = require('../base-model');
const { TRANSFER_CATEGORY_ID } = require('./constants');
const { EMPTY_TAGS_JSON, normalizeRowsTags, normalizeRowTags } = require('./tags');

const transactionsBaseModel = createBaseModel('transactions');
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;

function buildFilteredTransferWhereClause(filters = {}, tableAlias = 't') {
  const conditions = [`${tableAlias}.category_id = ?`, `${tableAlias}.transfer_id IS NOT NULL`];
  const params = [TRANSFER_CATEGORY_ID];

  if (filters.date_from !== undefined) {
    conditions.push(`${tableAlias}.occurred_at >= ?`);
    params.push(filters.date_from);
  }

  if (filters.date_to !== undefined) {
    conditions.push(`${tableAlias}.occurred_at <= ?`);
    params.push(filters.date_to);
  }

  if (filters.amount_from !== undefined) {
    conditions.push(`ABS(${tableAlias}.amount_cents) >= ?`);
    params.push(filters.amount_from);
  }

  if (filters.amount_to !== undefined) {
    conditions.push(`ABS(${tableAlias}.amount_cents) <= ?`);
    params.push(filters.amount_to);
  }

  if (Array.isArray(filters.accounts)) {
    if (filters.accounts.length === 0) {
      return {
        whereSql: ' WHERE 1 = 0',
        params: [],
      };
    }

    const accountPlaceholders = filters.accounts.map(() => '?').join(', ');
    conditions.push(`${tableAlias}.account_id IN (${accountPlaceholders})`);
    params.push(...filters.accounts);
  }

  return {
    whereSql: ` WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

function countFilteredTransfers(database, filters = {}) {
  const { whereSql, params } = buildFilteredTransferWhereClause(filters, 't');
  const sql = `
    WITH valid_transfer_ids AS (
      SELECT transfer_id
      FROM transactions
      WHERE category_id = ?
        AND transfer_id IS NOT NULL
      GROUP BY transfer_id
      HAVING SUM(CASE WHEN amount_cents < 0 THEN 1 ELSE 0 END) > 0
        AND SUM(CASE WHEN amount_cents > 0 THEN 1 ELSE 0 END) > 0
    ),
    filtered_transfers AS (
      SELECT t.transfer_id
      FROM transactions t
      INNER JOIN valid_transfer_ids v
        ON v.transfer_id = t.transfer_id
      ${whereSql}
      GROUP BY t.transfer_id
    )
    SELECT COUNT(*) AS total
    FROM filtered_transfers
  `;

  const row = database.prepare(sql).get(TRANSFER_CATEGORY_ID, ...params);
  return Number(row?.total ?? 0);
}

function listFilteredTransferRows(database, filters = {}, pagination = {}) {
  const { whereSql, params } = buildFilteredTransferWhereClause(filters, 't');
  const limit = pagination.page_size;
  const offset = (pagination.page - 1) * limit;
  const sql = `
    WITH valid_transfer_ids AS (
      SELECT transfer_id
      FROM transactions
      WHERE category_id = ?
        AND transfer_id IS NOT NULL
      GROUP BY transfer_id
      HAVING SUM(CASE WHEN amount_cents < 0 THEN 1 ELSE 0 END) > 0
        AND SUM(CASE WHEN amount_cents > 0 THEN 1 ELSE 0 END) > 0
    ),
    filtered_transfers AS (
      SELECT
        t.transfer_id,
        MAX(t.occurred_at) AS occurred_at_sort,
        MAX(t.id) AS id_sort
      FROM transactions t
      INNER JOIN valid_transfer_ids v
        ON v.transfer_id = t.transfer_id
      ${whereSql}
      GROUP BY t.transfer_id
    ),
    paged_transfers AS (
      SELECT transfer_id
      FROM filtered_transfers
      ORDER BY occurred_at_sort DESC, id_sort DESC
      LIMIT ? OFFSET ?
    )
    SELECT t.*
    FROM transactions t
    INNER JOIN paged_transfers p
      ON p.transfer_id = t.transfer_id
    WHERE t.category_id = ?
    ORDER BY t.occurred_at DESC, t.id DESC
  `;

  return database.prepare(sql).all(TRANSFER_CATEGORY_ID, ...params, limit, offset, TRANSFER_CATEGORY_ID);
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
    rows: normalizeRowsTags(rows),
    total: totalTransfers,
    page,
    page_size: normalizedPagination.page_size,
  };
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
