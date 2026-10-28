import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadElectronModule } from './helpers/electron-db.js';

// The migration runner applies each numbered file once, in order, inside a transaction, remembers how
// far it got in PRAGMA user_version (which travels with backups), copies the database aside before it
// changes an existing one, and refuses a database made by a newer app.

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { runMigrations, getMigrationFilePaths, LATEST_MIGRATION_VERSION } = loadElectronModule(
  'electron/database/migrations.js',
);

let dir;
let migrationsDir;
let dbPath;
let db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-migrations-'));
  migrationsDir = path.join(dir, 'migrations');
  fs.mkdirSync(migrationsDir);
  dbPath = path.join(dir, 'data.sqlite');
  db = new Database(dbPath);
  db.exec(
    'CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);',
  );
});

afterEach(() => {
  if (db.open) {
    db.close();
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

const write = (name, sql) => fs.writeFileSync(path.join(migrationsDir, name), sql);
const version = () => db.pragma('user_version', { simple: true });
const columns = (table) =>
  db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);
const run = (options = {}) =>
  runMigrations(db, { migrationsDir, databasePath: dbPath, ...options });
const backups = () => fs.readdirSync(dir).filter((name) => name.startsWith('db-pre-migration'));

function stamp() {
  const { formatTimestampForFilename } = loadElectronModule('electron/utils/file-utils.js');
  return formatTimestampForFilename();
}

describe('applying migrations', () => {
  it('applies every file above the current version, in numeric order, and records the version', () => {
    write('002_add_b.sql', 'ALTER TABLE notes ADD COLUMN b TEXT;');
    write('001_add_a.sql', 'ALTER TABLE notes ADD COLUMN a TEXT;');
    write('010_add_c.sql', 'ALTER TABLE notes ADD COLUMN c TEXT;');

    run();

    expect(columns('notes')).toEqual(['id', 'body', 'a', 'b', 'c']);
    expect(version()).toBe(10);
  });

  it('orders files by their number, not by their text, so 9 comes before 10', () => {
    write('10_after.sql', "INSERT INTO notes (body) VALUES ('second');");
    write('9_before.sql', "INSERT INTO notes (body) VALUES ('first');");

    run();

    expect(db.prepare('SELECT body FROM notes ORDER BY id').all()).toEqual([
      { body: 'first' },
      { body: 'second' },
    ]);
    expect(version()).toBe(10);
  });

  it('only treats NNN_name.sql as a migration: a number with no name or a different extension is not one', () => {
    write('001.sql', 'ALTER TABLE notes ADD COLUMN bare TEXT;');
    write('002_x.txt', 'ALTER TABLE notes ADD COLUMN txt TEXT;');
    write('003name.sql', 'ALTER TABLE notes ADD COLUMN glued TEXT;');
    write('x005_prefixed.sql', 'ALTER TABLE notes ADD COLUMN prefixed TEXT;');
    write('004_ok.sql', 'ALTER TABLE notes ADD COLUMN ok TEXT;');

    run();

    expect(columns('notes')).toEqual(['id', 'body', 'ok']);
    expect(version()).toBe(4);
  });

  it('runs each file only once, even for statements that are not repeatable', () => {
    write('001_add_a.sql', 'ALTER TABLE notes ADD COLUMN a TEXT;');

    run();
    expect(() => run()).not.toThrow();
    expect(() => run()).not.toThrow();

    expect(columns('notes')).toEqual(['id', 'body', 'a']);
  });

  it('applies only the files added since the last run', () => {
    write('001_add_a.sql', 'ALTER TABLE notes ADD COLUMN a TEXT;');
    run();
    write('002_add_b.sql', 'ALTER TABLE notes ADD COLUMN b TEXT;');

    run();

    expect(columns('notes')).toEqual(['id', 'body', 'a', 'b']);
    expect(version()).toBe(2);
  });

  it('ignores files that are not numbered migrations', () => {
    write('.gitkeep', '');
    write('README.md', 'notes');
    write('add_x.sql', 'ALTER TABLE notes ADD COLUMN x TEXT;');
    write('001_add_a.sql', 'ALTER TABLE notes ADD COLUMN a TEXT;');

    run();

    expect(columns('notes')).toEqual(['id', 'body', 'a']);
  });

  it('skips an empty migration file but still counts its number', () => {
    write('001_empty.sql', '   \n');
    write('002_add_b.sql', 'ALTER TABLE notes ADD COLUMN b TEXT;');

    run();

    expect(version()).toBe(2);
    expect(columns('notes')).toContain('b');
  });

  it('does nothing and leaves the version alone when there are no migrations', () => {
    run();

    expect(version()).toBe(0);
    expect(backups()).toEqual([]);
  });

  it('rejects two files with the same number', () => {
    write('001_first.sql', 'ALTER TABLE notes ADD COLUMN a TEXT;');
    write('001_second.sql', 'ALTER TABLE notes ADD COLUMN b TEXT;');

    expect(() => run()).toThrow(/same number/i);
    expect(columns('notes')).toEqual(['id', 'body']);
  });
});

describe('a migration that fails', () => {
  it('rolls back the whole file, so nothing is half applied', () => {
    write(
      '001_half.sql',
      "ALTER TABLE notes ADD COLUMN a TEXT; INSERT INTO notes (body) VALUES ('x'); ALTER TABLE missing_table ADD COLUMN z TEXT;",
    );

    expect(() => run()).toThrow(/001_half/);

    expect(columns('notes')).toEqual(['id', 'body']);
    expect(db.prepare('SELECT COUNT(*) AS n FROM notes').get().n).toBe(0);
    expect(version()).toBe(0);
  });

  it('keeps the migrations that already succeeded, and stops at the failing one', () => {
    write('001_ok.sql', 'ALTER TABLE notes ADD COLUMN a TEXT;');
    write('002_bad.sql', 'ALTER TABLE nope ADD COLUMN b TEXT;');
    write('003_never.sql', 'ALTER TABLE notes ADD COLUMN c TEXT;');

    expect(() => run()).toThrow(/002_bad/);

    expect(version()).toBe(1);
    expect(columns('notes')).toEqual(['id', 'body', 'a']);
  });

  it('retries the failing one on the next start once it is fixed', () => {
    write('001_bad.sql', 'ALTER TABLE nope ADD COLUMN b TEXT;');
    expect(() => run()).toThrow();

    write('001_bad.sql', 'ALTER TABLE notes ADD COLUMN b TEXT;');
    run();

    expect(columns('notes')).toContain('b');
    expect(version()).toBe(1);
  });
});

describe('the safety copy', () => {
  it('copies the database aside before applying a pending migration', () => {
    db.prepare("INSERT INTO notes (body) VALUES ('keep')").run();
    write('001_add_a.sql', 'ALTER TABLE notes ADD COLUMN a TEXT;');

    run();

    const [copy] = backups();
    expect(copy).toMatch(/^db-pre-migration-.*\.sqlite$/);
    const old = new Database(path.join(dir, copy), { readonly: true });
    try {
      expect(old.prepare('SELECT body FROM notes').all()).toEqual([{ body: 'keep' }]);
      expect(
        old
          .prepare('PRAGMA table_info(notes)')
          .all()
          .map((c) => c.name),
      ).toEqual(['id', 'body']);
      expect(old.pragma('user_version', { simple: true })).toBe(0);
    } finally {
      old.close();
    }
  });

  it('includes recent writes that are still in the WAL file', () => {
    db.pragma('journal_mode = WAL');
    db.prepare("INSERT INTO notes (body) VALUES ('in the wal')").run();
    write('001_add_a.sql', 'ALTER TABLE notes ADD COLUMN a TEXT;');

    run();

    const [copy] = backups();
    const old = new Database(path.join(dir, copy), { readonly: true });
    try {
      expect(old.prepare('SELECT body FROM notes').all()).toEqual([{ body: 'in the wal' }]);
    } finally {
      old.close();
    }
  });

  it('is not made when nothing is pending', () => {
    write('001_add_a.sql', 'ALTER TABLE notes ADD COLUMN a TEXT;');
    run();
    fs.rmSync(path.join(dir, backups()[0]));

    run();

    expect(backups()).toEqual([]);
  });

  it('is not made for a database that has no data yet', () => {
    write('001_add_a.sql', 'ALTER TABLE notes ADD COLUMN a TEXT;');

    run({ isNewDatabase: true });

    expect(backups()).toEqual([]);
    expect(columns('notes')).toContain('a');
  });

  it('is made once for several pending migrations, not once per file', () => {
    write('001_add_a.sql', 'ALTER TABLE notes ADD COLUMN a TEXT;');
    write('002_add_b.sql', 'ALTER TABLE notes ADD COLUMN b TEXT;');

    run();

    expect(backups()).toHaveLength(1);
  });

  it('stops the migration if the copy cannot be made, leaving the database untouched', () => {
    write('001_add_a.sql', 'ALTER TABLE notes ADD COLUMN a TEXT;');

    expect(() => run({ databasePath: path.join(dir, 'no-such-dir', 'x.sqlite') })).toThrow(/copy/i);

    expect(columns('notes')).toEqual(['id', 'body']);
    expect(version()).toBe(0);
  });

  it('does not clobber an earlier safety copy made in the same second', () => {
    write('001_add_a.sql', 'ALTER TABLE notes ADD COLUMN a TEXT;');
    const earlier = path.join(dir, `db-pre-migration-${stamp()}.sqlite`);
    fs.writeFileSync(earlier, 'older');

    run();

    expect(backups().length).toBeGreaterThanOrEqual(2);
    expect(fs.readFileSync(earlier, 'utf8')).toBe('older');
  });
});

describe('a database from a newer app', () => {
  it('is refused with a clear message, and nothing is changed', () => {
    write('001_add_a.sql', 'ALTER TABLE notes ADD COLUMN a TEXT;');
    db.pragma('user_version = 5');

    expect(() => run()).toThrow(/newer version/i);

    expect(version()).toBe(5);
    expect(columns('notes')).toEqual(['id', 'body']);
    expect(backups()).toEqual([]);
  });

  it('is accepted when its version matches the latest migration', () => {
    write('003_add_a.sql', 'ALTER TABLE notes ADD COLUMN a TEXT;');
    db.pragma('user_version = 3');

    expect(() => run()).not.toThrow();
  });
});

describe('new databases', () => {
  it('are stamped at the latest migration, since the base schema already includes them', () => {
    write('001_add_a.sql', 'ALTER TABLE notes ADD COLUMN a TEXT;');
    write('004_add_b.sql', 'ALTER TABLE notes ADD COLUMN b TEXT;');

    run({ isNewDatabase: true, stampOnly: true });

    expect(version()).toBe(4);
    expect(columns('notes')).toEqual(['id', 'body']);
  });
});

describe('the shipped migrations', () => {
  it('are numbered files that exist, with a latest version that matches them', () => {
    const files = getMigrationFilePaths();

    expect(LATEST_MIGRATION_VERSION).toBe(
      files.length === 0
        ? 0
        : Math.max(...files.map((file) => Number(path.basename(file).split('_')[0]))),
    );
  });
});
