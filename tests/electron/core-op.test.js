import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const core = require('../../electron/database/core_op.js');

let db;

function createTables({ withAppMeta = true } = {}) {
  db.exec(`
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      qty INTEGER,
      note TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      occurred_at INTEGER
    );
  `);
  if (withAppMeta) {
    db.exec('CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  }
}

function seed() {
  core.insertRow(db, 'items', { name: 'apple', qty: 5, note: null, occurred_at: Date.UTC(2023, 5, 15) });
  core.insertRow(db, 'items', { name: 'banana', qty: -3, note: 'ripe', occurred_at: Date.UTC(2024, 0, 1) });
  core.insertRow(db, 'items', { name: 'cherry', qty: 10, note: 'red', archived: 1, occurred_at: Date.UTC(2024, 11, 31) });
  core.insertRow(db, 'items', { name: 'date', qty: 0, note: null, occurred_at: null });
}

const names = (rows) => rows.map((row) => row.name);
const meta = (key) => db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key)?.value;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  createTables();
});

afterEach(() => {
  db.close();
});

describe('identifier safety', () => {
  const evil = [
    'items; DROP TABLE items',
    'items"',
    '"items"',
    'items--',
    'it ems',
    '1items',
    '',
    'a.b',
    "x' OR '1'='1",
  ];

  it.each(evil)('rejects table name %j everywhere', (tableName) => {
    expect(() => core.selectRows(db, tableName)).toThrow(/Invalid table name/);
    expect(() => core.countRows(db, tableName)).toThrow(/Invalid table name/);
    expect(() => core.insertRow(db, tableName, { name: 'x' })).toThrow(/Invalid table name/);
    expect(() => core.updateRows(db, tableName, { name: 'x' }, { id: 1 })).toThrow(/Invalid table name/);
    expect(() => core.deleteRows(db, tableName, { id: 1 })).toThrow(/Invalid table name/);
  });

  it.each(evil)('rejects column name %j in where, insert, update and order by', (column) => {
    expect(() => core.selectRows(db, 'items', { [column]: 1 })).toThrow(/Invalid identifier/);
    expect(() => core.insertRow(db, 'items', { [column]: 1 })).toThrow(/Invalid identifier/);
    expect(() => core.updateRows(db, 'items', { [column]: 1 }, { id: 1 })).toThrow(/Invalid identifier/);
    expect(() => core.selectRows(db, 'items', {}, { orderBy: [{ column }] })).toThrow(/Invalid orderBy/);
    if (column !== '') {
      expect(() => core.selectRows(db, 'items', {}, { orderBy: column })).toThrow(/Invalid orderBy/);
    }
  });

  it('treats an empty orderBy string as "no ordering" rather than an identifier', () => {
    seed();
    expect(core.selectRows(db, 'items', {}, { orderBy: '' })).toHaveLength(4);
  });

  it('rejects non-string identifiers', () => {
    expect(() => core.selectRows(db, null)).toThrow(/Invalid table name/);
    expect(() => core.selectRows(db, 5)).toThrow(/Invalid table name/);
    expect(() => core.selectRows(db, 'items', {}, { orderBy: [{ column: 5 }] })).toThrow(/Invalid orderBy/);
  });

  it('never executes injected SQL', () => {
    seed();
    expect(() => core.selectRows(db, 'items', { 'name; DELETE FROM items': 1 })).toThrow();
    expect(core.countRows(db, 'items')).toBe(4);
  });

  it('treats malicious VALUES as data', () => {
    const payload = "x'); DROP TABLE items; --";
    core.insertRow(db, 'items', { name: payload });
    expect(core.countRows(db, 'items')).toBe(1);
    expect(core.selectOne(db, 'items', { name: payload }).name).toBe(payload);
  });

  it('orderDirection is whitelisted, anything but DESC means ASC', () => {
    seed();
    const asc = names(core.selectRows(db, 'items', {}, { orderBy: 'name', orderDirection: 'DESC; DROP TABLE items' }));
    expect(asc).toEqual(['apple', 'banana', 'cherry', 'date']);
    expect(core.countRows(db, 'items')).toBe(4);
    expect(names(core.selectRows(db, 'items', {}, { orderBy: 'name', orderDirection: 'DESC' }))).toEqual([
      'date',
      'cherry',
      'banana',
      'apple',
    ]);
  });
});

describe('where operators', () => {
  beforeEach(seed);

  const find = (where) => names(core.selectRows(db, 'items', where, { orderBy: 'id' }));

  it('primitive means equality, null means IS NULL, array means IN', () => {
    expect(find({ name: 'apple' })).toEqual(['apple']);
    expect(find({ note: null })).toEqual(['apple', 'date']);
    expect(find({ id: [1, 3] })).toEqual(['apple', 'cherry']);
  });

  it('eq and ne, including null handling', () => {
    expect(find({ qty: { eq: 5 } })).toEqual(['apple']);
    expect(find({ note: { eq: null } })).toEqual(['apple', 'date']);
    expect(find({ note: { ne: null } })).toEqual(['banana', 'cherry']);
    expect(find({ qty: { ne: 5 } })).toEqual(['banana', 'cherry', 'date']);
  });

  it('gt, gte, lt, lte', () => {
    expect(find({ qty: { gt: 5 } })).toEqual(['cherry']);
    expect(find({ qty: { gte: 5 } })).toEqual(['apple', 'cherry']);
    expect(find({ qty: { lt: 0 } })).toEqual(['banana']);
    expect(find({ qty: { lte: 0 } })).toEqual(['banana', 'date']);
  });

  it('combines several operators on one column with AND', () => {
    expect(find({ qty: { gte: 0, lte: 5 } })).toEqual(['apple', 'date']);
  });

  it('abs operators compare absolute values', () => {
    expect(find({ qty: { absGt: 4 } })).toEqual(['apple', 'cherry']);
    expect(find({ qty: { absLte: 3 } })).toEqual(['banana', 'date']);
    expect(find({ qty: { absGte: 3, absLt: 6 } })).toEqual(['apple', 'banana']);
  });

  it('in and notIn, including the empty array cases', () => {
    expect(find({ id: { in: [2, 4] } })).toEqual(['banana', 'date']);
    expect(find({ id: { notIn: [2, 4] } })).toEqual(['apple', 'cherry']);
    expect(find({ id: { in: [] } })).toEqual([]);
    expect(find({ id: [] })).toEqual([]);
    expect(find({ id: { notIn: [] } })).toEqual(['apple', 'banana', 'cherry', 'date']);
  });

  it('isNull true and false', () => {
    expect(find({ note: { isNull: true } })).toEqual(['apple', 'date']);
    expect(find({ note: { isNull: false } })).toEqual(['banana', 'cherry']);
    expect(() => find({ note: { isNull: 1 } })).toThrow('where.note.isNull must be a boolean.');
  });

  it('joins different columns with AND', () => {
    expect(find({ archived: 0, qty: { gt: 0 } })).toEqual(['apple']);
  });

  it('range comparisons never match NULL values', () => {
    expect(find({ occurred_at: { gte: 0 } })).toEqual(['apple', 'banana', 'cherry']);
  });

  it('rejects unsupported operators, empty operator objects and null bounds', () => {
    expect(() => find({ qty: { like: '%5%' } })).toThrow('Unsupported operator "like" in where.qty.');
    expect(() => find({ qty: { '1=1; --': 1 } })).toThrow(/Unsupported operator/);
    expect(() => find({ qty: {} })).toThrow('where.qty cannot be an empty operator object.');
    expect(() => find({ qty: { gt: null } })).toThrow('where.qty.gt cannot be null.');
    expect(() => find({ qty: { absGt: null } })).toThrow('where.qty.absGt cannot be null.');
    expect(() => find({ id: { in: 'x' } })).toThrow('where.id.in must be an array.');
  });

  it('an empty where matches everything', () => {
    expect(find({})).toHaveLength(4);
    expect(find(undefined)).toHaveLength(4);
  });
});

describe('selectRows ordering and paging', () => {
  beforeEach(seed);

  it('orders by a string column or by a list of columns', () => {
    expect(names(core.selectRows(db, 'items', {}, { orderBy: 'qty' }))).toEqual([
      'banana',
      'date',
      'apple',
      'cherry',
    ]);
    core.insertRow(db, 'items', { name: 'elder', qty: 5 });
    expect(
      names(
        core.selectRows(db, 'items', {}, {
          orderBy: [
            { column: 'qty', direction: 'DESC' },
            { column: 'name', direction: 'DESC' },
          ],
        }),
      ),
    ).toEqual(['cherry', 'elder', 'apple', 'date', 'banana']);
  });

  it('rejects an empty or malformed orderBy list', () => {
    expect(() => core.selectRows(db, 'items', {}, { orderBy: [] })).toThrow(
      'orderBy must be a string or a non-empty array.',
    );
    expect(() => core.selectRows(db, 'items', {}, { orderBy: ['name'] })).toThrow(
      'orderBy[0] must be an object.',
    );
    expect(() => core.selectRows(db, 'items', {}, { orderBy: 5 })).toThrow(
      'orderBy must be a string or a non-empty array.',
    );
  });

  it('limit and offset work together or alone', () => {
    const page = (options) => names(core.selectRows(db, 'items', {}, { orderBy: 'id', ...options }));
    expect(page({ limit: 2 })).toEqual(['apple', 'banana']);
    expect(page({ limit: 2, offset: 2 })).toEqual(['cherry', 'date']);
    expect(page({ offset: 3 })).toEqual(['date']);
    expect(page({ limit: 2, offset: 10 })).toEqual([]);
  });

  it('ignores non-integer, zero and negative limits or offsets instead of interpolating them', () => {
    const all = (options) => core.selectRows(db, 'items', {}, { orderBy: 'id', ...options }).length;
    expect(all({ limit: 0 })).toBe(4);
    expect(all({ limit: -1 })).toBe(4);
    expect(all({ limit: 1.5 })).toBe(4);
    expect(all({ limit: '1; DROP TABLE items' })).toBe(4);
    expect(all({ offset: -1 })).toBe(4);
    expect(all({ offset: '1 OR 1=1' })).toBe(4);
    expect(core.countRows(db, 'items')).toBe(4);
  });

  it('selectOne returns the first match or null', () => {
    expect(core.selectOne(db, 'items', { name: 'banana' }).qty).toBe(-3);
    expect(core.selectOne(db, 'items', { name: 'nope' })).toBeNull();
  });
});

describe('write helpers', () => {
  it('insertRow returns the new id and requires a non-empty plain object', () => {
    expect(core.insertRow(db, 'items', { name: 'a' })).toBe(1);
    expect(core.insertRow(db, 'items', { name: 'b' })).toBe(2);
    expect(() => core.insertRow(db, 'items', {})).toThrow('row cannot be empty.');
    expect(() => core.insertRow(db, 'items', null)).toThrow('row must be a plain object.');
    expect(() => core.insertRow(db, 'items', [])).toThrow('row must be a plain object.');
  });

  it('updateRows and deleteRows return the changed count and refuse an empty where', () => {
    seed();
    // SQLite counts every matched row, even one whose value does not change (cherry is already archived).
    expect(core.updateRows(db, 'items', { archived: 1 }, { qty: { gt: 0 } })).toBe(2);
    expect(core.deleteRows(db, 'items', { archived: 1 })).toBe(2);
    expect(core.countRows(db, 'items')).toBe(2);

    expect(() => core.updateRows(db, 'items', { name: 'x' }, {})).toThrow('where cannot be empty.');
    expect(() => core.updateRows(db, 'items', {}, { id: 1 })).toThrow('changes cannot be empty.');
    expect(() => core.deleteRows(db, 'items', {})).toThrow('where cannot be empty.');
    expect(core.countRows(db, 'items')).toBe(2);
  });

  it('updateRows reports 0 when nothing matches', () => {
    seed();
    expect(core.updateRows(db, 'items', { name: 'x' }, { id: 999 })).toBe(0);
  });

  it('countRows applies the filter', () => {
    seed();
    expect(core.countRows(db, 'items')).toBe(4);
    expect(core.countRows(db, 'items', { archived: 1 })).toBe(1);
  });

  it('surfaces constraint violations instead of swallowing them', () => {
    expect(() => core.insertRow(db, 'items', { qty: 1 })).toThrow(/NOT NULL/);
  });
});

describe('change counter bookkeeping (app_meta)', () => {
  it('starts at the number of changed rows and records last write and schema version', () => {
    core.insertRow(db, 'items', { name: 'a' });
    expect(meta('change_counter')).toBe('1');
    expect(Number(meta('last_write_ms'))).toBeGreaterThan(0);
    expect(meta('schema_version')).toBe('1');
  });

  it('adds the number of rows each write touched', () => {
    seed();
    expect(meta('change_counter')).toBe('4');
    core.updateRows(db, 'items', { archived: 1 }, { qty: { gte: 0 } }); // apple, cherry, date
    expect(meta('change_counter')).toBe('7');
    core.deleteRows(db, 'items', { archived: 1 }); // the same three
    expect(meta('change_counter')).toBe('10');
  });

  it('does not bump the counter for writes that changed nothing', () => {
    seed();
    core.updateRows(db, 'items', { name: 'x' }, { id: 999 });
    core.deleteRows(db, 'items', { id: 999 });
    expect(meta('change_counter')).toBe('4');
  });

  it('does not count writes to app_meta itself', () => {
    core.insertRow(db, 'app_meta', { key: 'custom', value: '1' });
    expect(meta('change_counter')).toBeUndefined();
  });

  it('restarts from zero when the stored counter is corrupt', () => {
    db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('change_counter', 'banana');
    core.insertRow(db, 'items', { name: 'a' });
    expect(meta('change_counter')).toBe('1');
  });

  it('keeps working when app_meta does not exist', () => {
    db.exec('DROP TABLE app_meta');
    expect(core.insertRow(db, 'items', { name: 'a' })).toBe(1);
  });

  it('does not bump the counter when the write itself fails', () => {
    expect(() => core.insertRow(db, 'items', { qty: 1 })).toThrow();
    expect(meta('change_counter')).toBeUndefined();
  });

  // Raw SQL bypasses the counter. reset.controller.js does this today (PLAN 3.6), so auto-backup and
  // sync can believe nothing changed after a factory reset.
  it('documents that raw DELETE statements do not touch the counter', () => {
    seed();
    db.prepare('DELETE FROM items').run();
    expect(meta('change_counter')).toBe('4');
  });
});

describe('selectDistinctYearsFromUnixTimestampColumn', () => {
  beforeEach(seed);

  it('returns distinct years, newest first, ignoring NULL timestamps', () => {
    core.insertRow(db, 'items', { name: 'again', qty: 1, occurred_at: Date.UTC(2024, 5, 1) });
    expect(core.selectDistinctYearsFromUnixTimestampColumn(db, 'items', 'occurred_at')).toEqual([2024, 2023]);
  });

  it('applies the where filter', () => {
    expect(
      core.selectDistinctYearsFromUnixTimestampColumn(db, 'items', 'occurred_at', { archived: 1 }),
    ).toEqual([2024]);
  });

  it('validates its identifiers', () => {
    expect(() => core.selectDistinctYearsFromUnixTimestampColumn(db, 'items', 'x; DROP')).toThrow(
      /Invalid timestamp column/,
    );
    expect(() => core.selectDistinctYearsFromUnixTimestampColumn(db, 'bad name', 'occurred_at')).toThrow(
      /Invalid table name/,
    );
  });

  it('returns an empty list when there are no timestamps', () => {
    db.exec('DELETE FROM items');
    expect(core.selectDistinctYearsFromUnixTimestampColumn(db, 'items', 'occurred_at')).toEqual([]);
  });
});
