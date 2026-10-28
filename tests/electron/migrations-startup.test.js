import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeTestDatabase,
  insertAccounts,
  loadElectronModule,
  loadFreshElectronModule,
  openTestDatabase,
} from './helpers/electron-db.js';

// How the real startup paths use the runner: a fresh install is stamped as current without a safety
// copy, an existing database from before version tracking is accepted as it is, and a factory reset
// builds a current database too.

let databaseModule;
let migrations;

beforeEach(() => {
  openTestDatabase();
  databaseModule = loadElectronModule('electron/database');
  migrations = loadElectronModule('electron/database/migrations.js');
});

afterEach(closeTestDatabase);

const dataDir = () => path.dirname(databaseModule.getDatabasePath());
const safetyCopies = () =>
  fs.readdirSync(dataDir()).filter((name) => name.startsWith('db-pre-migration'));
const userVersion = () => databaseModule.getDatabase().pragma('user_version', { simple: true });

describe('an existing database from before version tracking', () => {
  it('starts at version 0, so every migration that exists is applied to it', () => {
    expect(userVersion()).toBe(0);
  });

  it('is brought up to date at startup, keeps its data, and is copied aside first', () => {
    insertAccounts(databaseModule.getDatabase(), ['Keep me']);

    migrations.runMigrations(databaseModule.getDatabase());

    expect(userVersion()).toBe(migrations.LATEST_MIGRATION_VERSION);
    expect(safetyCopies()).toHaveLength(1);
    expect(
      databaseModule
        .getDatabase()
        .prepare('SELECT name FROM accounts')
        .all()
        .map((r) => r.name),
    ).toEqual(['Keep me']);
  });

  it('gets no safety copy once it is up to date', () => {
    migrations.runMigrations(databaseModule.getDatabase());
    for (const name of safetyCopies()) {
      fs.rmSync(path.join(dataDir(), name));
    }

    migrations.runMigrations(databaseModule.getDatabase());

    expect(safetyCopies()).toEqual([]);
  });
});

describe('a factory reset', () => {
  it('builds a database stamped as current, without a safety copy', async () => {
    const reset = loadFreshElectronModule('electron/controllers/reset.controller.js');

    expect(await reset.factoryReset()).toEqual({ ok: true });

    expect(userVersion()).toBe(migrations.LATEST_MIGRATION_VERSION);
    expect(safetyCopies()).toEqual([]);
  });
});

// main.js starts Electron, so it cannot be loaded here: its call is checked as source text. A factory
// reset is covered by behaviour above. With a migration that is idempotent (every one so far) "stamped
// as current" and "migrations applied to a fresh database" end in the same state, so the stamping
// itself is pinned with a migration that would fail if it ran against a database built from schemas/.
describe('a new database is stamped, not migrated', () => {
  it('applies none of the migration files to a database built from the latest schema', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-stamp-'));
    try {
      // This file would fail on a database that already has the base schema, so it proves the
      // runner never executed it.
      fs.writeFileSync(
        path.join(directory, '001_would_fail_on_a_new_database.sql'),
        'CREATE TABLE accounts (id INTEGER);',
      );

      migrations.runMigrations(databaseModule.getDatabase(), {
        migrationsDir: directory,
        isNewDatabase: true,
        stampOnly: true,
      });

      expect(userVersion()).toBe(1);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('would fail on that same database if it were migrated instead', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-stamp-'));
    try {
      fs.writeFileSync(
        path.join(directory, '001_would_fail_on_a_new_database.sql'),
        'CREATE TABLE accounts (id INTEGER);',
      );

      expect(() =>
        migrations.runMigrations(databaseModule.getDatabase(), {
          migrationsDir: directory,
          isNewDatabase: true,
        }),
      ).toThrow(/001_would_fail/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('main.js startup wiring', () => {
  const source = fs.readFileSync(path.resolve('electron/main.js'), 'utf8');
  const resetSource = fs.readFileSync(
    path.resolve('electron/controllers/reset.controller.js'),
    'utf8',
  );

  it('stamps a first-start database as current instead of applying migrations to it', () => {
    expect(source).toMatch(
      /runMigrations\(database,\s*\{\s*isNewDatabase:\s*firstStart,\s*stampOnly:\s*firstStart\s*\}\)/,
    );
  });

  it('stamps a factory-reset database the same way', () => {
    expect(resetSource).toMatch(
      /runMigrations\(db,\s*\{\s*isNewDatabase:\s*true,\s*stampOnly:\s*true\s*\}\)/,
    );
  });
});
