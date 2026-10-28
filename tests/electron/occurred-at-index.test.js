import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeTestDatabase,
  insertAccounts,
  loadElectronModule,
  openTestDatabase,
} from './helpers/electron-db.js';

// The first real migration: an index on transactions(occurred_at), so date-range queries (the
// overview, analytics, exports) stop scanning the whole table. It must reach existing databases
// through the migration and new ones through schemas/, and both routes must end up identical.

const INDEX_NAME = 'idx_tx_occurred_at';

let db;
let databaseModule;
let migrations;

beforeEach(() => {
  db = openTestDatabase();
  databaseModule = loadElectronModule('electron/database');
  migrations = loadElectronModule('electron/database/migrations.js');
});

afterEach(closeTestDatabase);

const indexNames = (database) =>
  database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'transactions'")
    .all()
    .map((row) => row.name)
    .sort();
const dataDir = () => path.dirname(databaseModule.getDatabasePath());
const safetyCopies = () =>
  fs.readdirSync(dataDir()).filter((name) => name.startsWith('db-pre-migration'));

/** Turns the fresh test database into what an install from before this migration looks like. */
function makeOldDatabase() {
  db.exec(`DROP INDEX ${INDEX_NAME}`);
  db.pragma('user_version = 0');
}

describe('the shipped migration', () => {
  it('exists as migration 1', () => {
    expect(migrations.LATEST_MIGRATION_VERSION).toBe(1);
    expect(migrations.getMigrationFilePaths().map((file) => path.basename(file))).toEqual([
      '001_transactions_occurred_at_index.sql',
    ]);
  });

  it('adds the index to an existing database and records the new version', () => {
    makeOldDatabase();
    expect(indexNames(db)).not.toContain(INDEX_NAME);

    migrations.runMigrations(db);

    expect(indexNames(db)).toContain(INDEX_NAME);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
  });

  it('keeps the data of an existing database', () => {
    insertAccounts(db, ['Keep me']);
    makeOldDatabase();

    migrations.runMigrations(db);

    expect(db.prepare('SELECT name FROM accounts').all()).toEqual([{ name: 'Keep me' }]);
  });

  it('copies the old database aside first, as it was before the index existed', () => {
    makeOldDatabase();

    migrations.runMigrations(db);

    const [copy] = safetyCopies();
    expect(copy).toMatch(/^db-pre-migration-.*\.sqlite$/);
    const Database = db.constructor;
    const old = new Database(path.join(dataDir(), copy), { readonly: true });
    try {
      expect(indexNames(old)).not.toContain(INDEX_NAME);
      expect(old.pragma('user_version', { simple: true })).toBe(0);
    } finally {
      old.close();
    }
  });

  it('does nothing the second time', () => {
    makeOldDatabase();
    migrations.runMigrations(db);
    for (const name of safetyCopies()) {
      fs.rmSync(path.join(dataDir(), name));
    }

    migrations.runMigrations(db);

    expect(safetyCopies()).toEqual([]);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
  });

  it('is harmless on a database that already has the index', () => {
    db.pragma('user_version = 0');

    expect(() => migrations.runMigrations(db)).not.toThrow();
    expect(indexNames(db).filter((name) => name === INDEX_NAME)).toHaveLength(1);
  });
});

describe('schemas/ and the migration agree', () => {
  it('a new database already has the index', () => {
    expect(indexNames(db)).toContain(INDEX_NAME);
  });

  it('a migrated old database ends up with exactly the indexes of a new one', () => {
    const fresh = indexNames(db);
    makeOldDatabase();

    migrations.runMigrations(db);

    expect(indexNames(db)).toEqual(fresh);
  });

  it('defines the index the same way in both places', () => {
    const definition = (sql) => sql.replace(/\s+/g, ' ').trim().toLowerCase();
    const schema = fs.readFileSync(
      path.resolve('electron/database/schemas/003_transactions.sql'),
      'utf8',
    );
    const migration = fs.readFileSync(
      path.resolve('electron/database/migrations/001_transactions_occurred_at_index.sql'),
      'utf8',
    );
    const pick = (sql) => sql.match(/CREATE INDEX IF NOT EXISTS idx_tx_occurred_at[^;]*;/i)?.[0];

    expect(pick(schema)).toBeTruthy();
    expect(definition(pick(schema))).toBe(definition(pick(migration)));
  });
});

describe('what the index is for', () => {
  const planOf = (sql, ...params) =>
    db
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...params)
      .map((row) => row.detail)
      .join(' | ');

  it('is used for a date-range query over all accounts', () => {
    const plan = planOf(
      'SELECT * FROM transactions WHERE occurred_at >= ? AND occurred_at <= ?',
      1,
      2,
    );

    expect(plan).toContain(INDEX_NAME);
  });

  it('is used to order by date without sorting the whole table', () => {
    const plan = planOf('SELECT * FROM transactions ORDER BY occurred_at DESC LIMIT 10');

    expect(plan).toContain(INDEX_NAME);
    expect(plan).not.toMatch(/USE TEMP B-TREE/i);
  });

  it('was a full scan before the index existed', () => {
    makeOldDatabase();

    const plan = planOf(
      'SELECT * FROM transactions WHERE occurred_at >= ? AND occurred_at <= ?',
      1,
      2,
    );

    expect(plan).toMatch(/SCAN/);
    expect(plan).not.toContain(INDEX_NAME);
  });
});
