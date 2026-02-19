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
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
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

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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

function appendInCondition(clauses, params, quotedColumn, values, label, options = {}) {
  if (!Array.isArray(values)) {
    throw new Error(`${label} must be an array.`);
  }

  if (values.length === 0) {
    clauses.push(options.negate ? '1 = 1' : '1 = 0');
    return;
  }

  const placeholdersSql = values.map(() => '?').join(', ');
  const operator = options.negate ? 'NOT IN' : 'IN';
  clauses.push(`${quotedColumn} ${operator} (${placeholdersSql})`);
  params.push(...values);
}

function appendOperatorCondition(clauses, params, quotedColumn, operator, value, label) {
  switch (operator) {
    case 'eq':
      if (value === null) {
        clauses.push(`${quotedColumn} IS NULL`);
      } else {
        clauses.push(`${quotedColumn} = ?`);
        params.push(value);
      }
      return;
    case 'ne':
      if (value === null) {
        clauses.push(`${quotedColumn} IS NOT NULL`);
      } else {
        clauses.push(`${quotedColumn} != ?`);
        params.push(value);
      }
      return;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (value === null) {
        throw new Error(`${label}.${operator} cannot be null.`);
      }

      const sqlOperator = {
        gt: '>',
        gte: '>=',
        lt: '<',
        lte: '<=',
      }[operator];

      clauses.push(`${quotedColumn} ${sqlOperator} ?`);
      params.push(value);
      return;
    }
    case 'absGt':
    case 'absGte':
    case 'absLt':
    case 'absLte': {
      if (value === null) {
        throw new Error(`${label}.${operator} cannot be null.`);
      }

      const sqlOperator = {
        absGt: '>',
        absGte: '>=',
        absLt: '<',
        absLte: '<=',
      }[operator];

      clauses.push(`ABS(${quotedColumn}) ${sqlOperator} ?`);
      params.push(value);
      return;
    }
    case 'in':
      appendInCondition(clauses, params, quotedColumn, value, `${label}.in`);
      return;
    case 'notIn':
      appendInCondition(clauses, params, quotedColumn, value, `${label}.notIn`, { negate: true });
      return;
    case 'isNull':
      if (typeof value !== 'boolean') {
        throw new Error(`${label}.isNull must be a boolean.`);
      }
      clauses.push(`${quotedColumn} IS ${value ? '' : 'NOT '}NULL`);
      return;
    default:
      throw new Error(`Unsupported operator "${operator}" in ${label}.`);
  }
}

/**
 * Builds a parameterized WHERE clause from a filter map.
 *
 * Example:
 * `buildWhereClause({ id: 1, archived: 0, parent_id: { isNull: true } })`
 * returns `{ clause: ' WHERE "id" = ? AND "archived" = ? AND "parent_id" IS NULL', params: [1, 0] }`
 *
 * Supported value shapes:
 * - primitive value: `{ column: value }` => `"column" = ?`
 * - `null` value: `{ column: null }` => `"column" IS NULL`
 * - array value: `{ column: [1, 2] }` => `"column" IN (?, ?)`
 * - operator object:
 *   - `{ eq, ne, gt, gte, lt, lte, absGt, absGte, absLt, absLte, in, notIn, isNull }`
 *
 * @param {Record<string, unknown>} where - Column/value filters.
 * @returns {{ clause: string, params: unknown[] }} SQL fragment and parameter list.
 */
function buildWhereClause(where) {
  if (!where || Object.keys(where).length === 0) {
    return { clause: '', params: [] };
  }

  const clauses = [];
  const params = [];

  for (const key of Object.keys(where)) {
    const quotedKey = quoteIdentifier(key);
    const condition = where[key];
    const label = `where.${key}`;

    if (Array.isArray(condition)) {
      appendInCondition(clauses, params, quotedKey, condition, label);
      continue;
    }

    if (condition === null) {
      clauses.push(`${quotedKey} IS NULL`);
      continue;
    }

    if (isPlainObject(condition)) {
      const entries = Object.entries(condition);
      if (entries.length === 0) {
        throw new Error(`${label} cannot be an empty operator object.`);
      }

      for (const [operator, value] of entries) {
        appendOperatorCondition(clauses, params, quotedKey, operator, value, label);
      }
      continue;
    }

    clauses.push(`${quotedKey} = ?`);
    params.push(condition);
  }

  const clause = clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`;

  return { clause, params };
}

function buildOrderByClause(options = {}) {
  if (!options.orderBy) {
    return '';
  }

  if (typeof options.orderBy === 'string') {
    assertIdentifier(options.orderBy, 'orderBy');
    const direction = options.orderDirection === 'DESC' ? 'DESC' : 'ASC';
    return ` ORDER BY ${quoteIdentifier(options.orderBy)} ${direction}`;
  }

  if (!Array.isArray(options.orderBy) || options.orderBy.length === 0) {
    throw new Error('orderBy must be a string or a non-empty array.');
  }

  const parts = options.orderBy.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new Error(`orderBy[${index}] must be an object.`);
    }

    const column = entry.column;
    assertIdentifier(column, `orderBy[${index}].column`);
    const direction = entry.direction === 'DESC' ? 'DESC' : 'ASC';
    return `${quoteIdentifier(column)} ${direction}`;
  });

  return ` ORDER BY ${parts.join(', ')}`;
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
 * Selects rows using filters and optional ordering/pagination.
 *
 * @param {import('better-sqlite3').Database} database - Open SQLite connection.
 * @param {string} tableName - Source table name.
 * @param {Record<string, unknown>} [where={}] - Column/value filters.
 * @param {{
 *   orderBy?: string | { column: string, direction?: 'ASC'|'DESC' }[],
 *   orderDirection?: 'ASC'|'DESC',
 *   limit?: number,
 *   offset?: number
 * }} [options={}] - Query options.
 * @returns {Record<string, unknown>[]} Matching rows.
 */
function selectRows(database, tableName, where = {}, options = {}) {
  ensureObject(where, 'where');
  assertIdentifier(tableName, 'table name');

  const { clause, params } = buildWhereClause(where);
  let sql = `SELECT * FROM ${quoteIdentifier(tableName)}${clause}`;
  const hasLimit = Number.isInteger(options.limit) && options.limit > 0;
  const hasOffset = Number.isInteger(options.offset) && options.offset >= 0;

  sql += buildOrderByClause(options);

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
 * Counts rows using filters.
 *
 * @param {import('better-sqlite3').Database} database - Open SQLite connection.
 * @param {string} tableName - Source table name.
 * @param {Record<string, unknown>} [where={}] - Column/value filters.
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
 * @param {Record<string, unknown>} [where={}] - Column/value filters.
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
 * @param {Record<string, unknown>} where - Column/value filters.
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
 * @param {Record<string, unknown>} where - Column/value filters.
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
