import fs from 'node:fs';
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
  it('starts at version 0, so every migration that exists would apply to it', () => {
    expect(userVersion()).toBe(0);
  });

  it('is accepted at startup, keeps its data, and gets no safety copy while there is nothing to apply', () => {
    insertAccounts(databaseModule.getDatabase(), ['Keep me']);

    migrations.runMigrations(databaseModule.getDatabase());

    expect(safetyCopies()).toEqual([]);
    expect(
      databaseModule
        .getDatabase()
        .prepare('SELECT name FROM accounts')
        .all()
        .map((r) => r.name),
    ).toEqual(['Keep me']);
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

// No migration ships yet, so "stamped as current" and "not stamped" give the same result at runtime
// and cannot be told apart by behaviour. main.js also starts Electron, so it cannot be loaded here.
// These check that the calls are written the way the runner tests assume; the behaviour itself is
// covered by the runner tests above. Once the first real migration exists, replace them with
// behavioural tests.
describe('startup wiring', () => {
  const source = fs.readFileSync(path.resolve('electron/main.js'), 'utf8');
  const resetSource = fs.readFileSync(
    path.resolve('electron/controllers/reset.controller.js'),
    'utf8',
  );

  it('stamps a factory-reset database as current instead of applying migrations to it', () => {
    expect(resetSource).toMatch(
      /runMigrations\(db,\s*\{\s*isNewDatabase:\s*true,\s*stampOnly:\s*true\s*\}\)/,
    );
  });

  it('stamps a first-start database as current instead of applying migrations to it', () => {
    expect(source).toMatch(
      /runMigrations\(database,\s*\{\s*isNewDatabase:\s*firstStart,\s*stampOnly:\s*firstStart\s*\}\)/,
    );
  });
});
