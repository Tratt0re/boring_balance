const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Validates that a value is a safe SQL identifier (table/column name).
 * This prevents identifier-based SQL injection when building dynamic SQL.
 *
 * @param {string} value - Identifier candidate.
 * @param {string} label - Field label used in error messages.
 * @returns {void}
 * @throws {Error} If identifier does not match the allowed pattern.
 */
function assertIdentifier(value, label) {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}: "${value}"`);
  }
}

/**
 * Quotes a validated SQL identifier with double quotes.
 *
 * @param {string} identifier - Identifier to quote.
 * @returns {string} Quoted identifier.
 */
function quoteIdentifier(identifier) {
  assertIdentifier(identifier, 'identifier');
  return `"${identifier}"`;
}

/**
 * Ensures a value is a plain object (not null and not an array).
 *
 * @param {unknown} value - Value to validate.
 * @param {string} label - Field label used in error messages.
 * @returns {void}
 * @throws {Error} If the value is not a plain object.
 */
function ensureObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object.`);
  }
}

/**
 * Ensures a value is a plain object and has at least one key.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} label - Field label used in error messages.
 * @returns {void}
 * @throws {Error} If the value is not a plain object or has no keys.
 */
function ensureObjectHasKeys(value, label) {
  ensureObject(value, label);
  if (Object.keys(value).length === 0) {
    throw new Error(`${label} cannot be empty.`);
  }
}

/**
 * Builds a parameterized WHERE clause from an equality map.
 *
 * Example:
 * `buildWhereClause({ id: 1, archived: 0 })`
 * returns `{ clause: ' WHERE "id" = ? AND "archived" = ?', params: [1, 0] }`
 *
 * @param {Record<string, unknown>} where - Column/value equality filters.
 * @returns {{ clause: string, params: unknown[] }} SQL fragment and parameter list.
 */
function buildWhereClause(where) {
  if (!where || Object.keys(where).length === 0) {
    return { clause: '', params: [] };
  }

  const keys = Object.keys(where);
  const clause = ` WHERE ${keys.map((key) => `${quoteIdentifier(key)} = ?`).join(' AND ')}`;
  const params = keys.map((key) => where[key]);

  return { clause, params };
}

/**
 * Inserts a single row and returns the inserted row id.
 *
 * @param {import('better-sqlite3').Database} database - Open SQLite connection.
 * @param {string} tableName - Target table name.
 * @param {Record<string, unknown>} row - Column/value map to insert.
 * @returns {number|bigint} Inserted row id (`lastInsertRowid`).
 */
function insertRow(database, tableName, row) {
  ensureObjectHasKeys(row, 'row');
  assertIdentifier(tableName, 'table name');

  const keys = Object.keys(row);
  const columnsSql = keys.map((key) => quoteIdentifier(key)).join(', ');
  const placeholdersSql = keys.map(() => '?').join(', ');
  const values = keys.map((key) => row[key]);

  const sql = `INSERT INTO ${quoteIdentifier(tableName)} (${columnsSql}) VALUES (${placeholdersSql})`;
  const result = database.prepare(sql).run(values);

  return result.lastInsertRowid;
}

/**
 * Selects rows using equality filters and optional ordering/pagination.
 *
 * @param {import('better-sqlite3').Database} database - Open SQLite connection.
 * @param {string} tableName - Source table name.
 * @param {Record<string, unknown>} [where={}] - Column/value equality filters.
 * @param {{ orderBy?: string, orderDirection?: 'ASC'|'DESC', limit?: number, offset?: number }} [options={}] - Query options.
 * @returns {Record<string, unknown>[]} Matching rows.
 */
function selectRows(database, tableName, where = {}, options = {}) {
  ensureObject(where, 'where');
  assertIdentifier(tableName, 'table name');

  const { clause, params } = buildWhereClause(where);
  let sql = `SELECT * FROM ${quoteIdentifier(tableName)}${clause}`;
  const hasLimit = Number.isInteger(options.limit) && options.limit > 0;
  const hasOffset = Number.isInteger(options.offset) && options.offset >= 0;

  if (options.orderBy) {
    assertIdentifier(options.orderBy, 'orderBy');
    const direction = options.orderDirection === 'DESC' ? 'DESC' : 'ASC';
    sql += ` ORDER BY ${quoteIdentifier(options.orderBy)} ${direction}`;
  }

  if (hasLimit) {
    sql += ` LIMIT ${options.limit}`;
  }

  if (hasOffset && !hasLimit) {
    sql += ' LIMIT -1';
  }

  if (hasOffset) {
    sql += ` OFFSET ${options.offset}`;
  }

  return database.prepare(sql).all(params);
}

/**
 * Counts rows using equality filters.
 *
 * @param {import('better-sqlite3').Database} database - Open SQLite connection.
 * @param {string} tableName - Source table name.
 * @param {Record<string, unknown>} [where={}] - Column/value equality filters.
 * @returns {number} Number of matching rows.
 */
function countRows(database, tableName, where = {}) {
  ensureObject(where, 'where');
  assertIdentifier(tableName, 'table name');

  const { clause, params } = buildWhereClause(where);
  const sql = `SELECT COUNT(*) AS "total" FROM ${quoteIdentifier(tableName)}${clause}`;
  const row = database.prepare(sql).get(params);

  return Number(row?.total ?? 0);
}

/**
 * Selects the first row that matches the given filter.
 *
 * @param {import('better-sqlite3').Database} database - Open SQLite connection.
 * @param {string} tableName - Source table name.
 * @param {Record<string, unknown>} [where={}] - Column/value equality filters.
 * @returns {Record<string, unknown>|null} First matching row or `null`.
 */
function selectOne(database, tableName, where = {}) {
  const rows = selectRows(database, tableName, where, { limit: 1 });
  return rows[0] ?? null;
}

/**
 * Updates rows matching the given filter.
 *
 * @param {import('better-sqlite3').Database} database - Open SQLite connection.
 * @param {string} tableName - Target table name.
 * @param {Record<string, unknown>} changes - Column/value updates.
 * @param {Record<string, unknown>} where - Column/value equality filters.
 * @returns {number} Number of changed rows.
 */
function updateRows(database, tableName, changes, where) {
  ensureObjectHasKeys(changes, 'changes');
  ensureObjectHasKeys(where, 'where');
  assertIdentifier(tableName, 'table name');

  const changeKeys = Object.keys(changes);
  const setSql = changeKeys.map((key) => `${quoteIdentifier(key)} = ?`).join(', ');
  const changeValues = changeKeys.map((key) => changes[key]);

  const { clause, params } = buildWhereClause(where);
  const sql = `UPDATE ${quoteIdentifier(tableName)} SET ${setSql}${clause}`;

  const result = database.prepare(sql).run([...changeValues, ...params]);
  return result.changes;
}

/**
 * Deletes rows matching the given filter.
 *
 * @param {import('better-sqlite3').Database} database - Open SQLite connection.
 * @param {string} tableName - Target table name.
 * @param {Record<string, unknown>} where - Column/value equality filters.
 * @returns {number} Number of deleted rows.
 */
function deleteRows(database, tableName, where) {
  ensureObjectHasKeys(where, 'where');
  assertIdentifier(tableName, 'table name');

  const { clause, params } = buildWhereClause(where);
  const sql = `DELETE FROM ${quoteIdentifier(tableName)}${clause}`;
  const result = database.prepare(sql).run(params);

  return result.changes;
}

module.exports = {
  countRows,
  deleteRows,
  insertRow,
  selectOne,
  selectRows,
  updateRows,
};
