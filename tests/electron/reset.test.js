import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeTestDatabase,
  insertAccounts,
  loadElectronModule,
  loadFreshElectronModule,
  openTestDatabase,
  readChangeCounter,
} from './helpers/electron-db.js';

// Clearing data must count as a change (backup and sync decide what to copy from the change counter),
// and a factory reset that fails must leave the user's data and a working database in place.

let db;
let reset;
let databaseModule;

beforeEach(() => {
  db = openTestDatabase();
  databaseModule = loadElectronModule('electron/database');
  reset = loadFreshElectronModule('electron/controllers/reset.controller.js');
});

afterEach(closeTestDatabase);

const count = (table) =>
  databaseModule.getDatabase().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const dataDir = () => path.dirname(databaseModule.getDatabasePath());
const asideFiles = () => fs.readdirSync(dataDir()).filter((name) => /reset/i.test(name));

describe('clearFinancialData', () => {
  it('removes accounts', () => {
    insertAccounts(db, ['A', 'B']);

    expect(reset.clearFinancialData()).toEqual({ ok: true });

    expect(count('accounts')).toBe(0);
  });

  it('counts as a change, so backup and sync notice it', () => {
    insertAccounts(db, ['A', 'B']);
    const before = readChangeCounter(databaseModule.getDatabase());

    reset.clearFinancialData();

    expect(readChangeCounter(databaseModule.getDatabase())).toBeGreaterThan(before);
  });

  it('does not bump the counter when there was nothing to clear', () => {
    reset.clearFinancialData();
    const before = readChangeCounter(databaseModule.getDatabase());

    reset.clearFinancialData();

    expect(readChangeCounter(databaseModule.getDatabase())).toBe(before);
  });

  it('keeps the system categories', () => {
    const locked = count('categories');
    insertAccounts(db, ['A']);

    reset.clearFinancialData();

    expect(count('categories')).toBe(locked);
  });

  it('reports a failure and changes nothing', () => {
    insertAccounts(db, ['A']);
    db.exec(
      "CREATE TRIGGER refuse_clear BEFORE DELETE ON accounts BEGIN SELECT RAISE(ABORT, 'refused on purpose'); END;",
    );
    const before = readChangeCounter(db);

    const result = reset.clearFinancialData();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/refused on purpose/);
    expect(count('accounts')).toBe(1);
    expect(readChangeCounter(db)).toBe(before);
  });
});

describe('factoryReset and the saved settings', () => {
  const settingsStore = () => loadElectronModule('electron/utils/settings-store.js');

  it('removes the saved settings file after a successful reset', () => {
    settingsStore().setSettingsSection('backup', { enabled: true });
    expect(fs.existsSync(settingsStore().getSettingsFilePath())).toBe(true);

    reset.factoryReset();

    expect(fs.existsSync(settingsStore().getSettingsFilePath())).toBe(false);
  });

  it('keeps the saved settings when the reset fails', () => {
    settingsStore().setSettingsSection('backup', { enabled: true });
    const schemaModule = loadElectronModule('electron/database/schema.js');
    const original = schemaModule.initSchema;
    schemaModule.initSchema = () => {
      throw new Error('schema refused');
    };

    try {
      loadFreshElectronModule('electron/controllers/reset.controller.js').factoryReset();
    } finally {
      schemaModule.initSchema = original;
    }

    expect(fs.existsSync(settingsStore().getSettingsFilePath())).toBe(true);
  });

  it('does not leave half-built files of the new database after a failed reset', () => {
    insertAccounts(db, ['Keep me']);
    const schemaModule = loadElectronModule('electron/database/schema.js');
    const original = schemaModule.initSchema;
    schemaModule.initSchema = () => {
      throw new Error('schema refused');
    };

    try {
      loadFreshElectronModule('electron/controllers/reset.controller.js').factoryReset();
    } finally {
      schemaModule.initSchema = original;
    }

    expect(
      databaseModule
        .getDatabase()
        .prepare('SELECT name FROM accounts')
        .all()
        .map((r) => r.name),
    ).toEqual(['Keep me']);
    expect(
      databaseModule.getDatabase().prepare('SELECT COUNT(*) AS n FROM app_meta').get().n,
    ).toBeGreaterThan(0);
  });
});

describe('factoryReset', () => {
  it('leaves a fresh, empty, working database with a new identity', () => {
    insertAccounts(db, ['A']);
    const oldIdentity = db.prepare("SELECT value FROM app_meta WHERE key = 'db_uuid'").get().value;

    expect(reset.factoryReset()).toEqual({ ok: true });

    const fresh = databaseModule.getDatabase();
    expect(count('accounts')).toBe(0);
    expect(fresh.prepare("SELECT value FROM app_meta WHERE key = 'db_uuid'").get().value).not.toBe(
      oldIdentity,
    );
    expect(() => insertAccounts(fresh, ['After'])).not.toThrow();
  });

  it('leaves no temporary files behind after a successful reset', () => {
    insertAccounts(db, ['A']);

    reset.factoryReset();

    expect(asideFiles()).toEqual([]);
  });

  it('brings the user data back when building the new database fails', () => {
    insertAccounts(db, ['Keep me']);
    const schemaModule = loadElectronModule('electron/database/schema.js');
    const original = schemaModule.initSchema;
    schemaModule.initSchema = () => {
      throw new Error('schema refused');
    };

    let result;
    try {
      // Loaded after the stub is installed, because the controller captures initSchema at load.
      result = loadFreshElectronModule('electron/controllers/reset.controller.js').factoryReset();
    } finally {
      schemaModule.initSchema = original;
    }

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/schema refused/);
    const names = databaseModule
      .getDatabase()
      .prepare('SELECT name FROM accounts')
      .all()
      .map((row) => row.name);
    expect(names).toEqual(['Keep me']);
    expect(asideFiles()).toEqual([]);
  });
});
