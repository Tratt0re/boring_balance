import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeTestDatabase,
  insertAccounts,
  loadElectronModule,
  loadFreshElectronModule,
  openTestDatabase,
  sentEvents,
  setOpenDialogResult,
} from './helpers/electron-db.js';

// A restore can pass the validity check and still fail afterwards, when the restored file is opened
// and brought up to date. The user's previous data must then come back, not be left stranded in a
// "db-local-prev" file next to a database the app cannot open.

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

let workDir;
let backupController;
let databaseModule;

beforeEach(() => {
  openTestDatabase();
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-rollback-'));
  databaseModule = loadElectronModule('electron/database');
  backupController = loadFreshElectronModule('electron/controllers/backup.controller.js');
  insertAccounts(databaseModule.getDatabase(), ['Keep me']);
});

afterEach(() => {
  closeTestDatabase();
  fs.rmSync(workDir, { recursive: true, force: true });
});

const liveAccountNames = () =>
  databaseModule
    .getDatabase()
    .prepare('SELECT name FROM accounts ORDER BY id')
    .all()
    .map((row) => row.name);

/**
 * A backup that passes the validity check (healthy, has an identity) but cannot be brought up to date:
 * it lacks a change counter and a trigger refuses to let one be added. It has the tables the shipped
 * migrations touch, so they apply and the failure comes from the trigger.
 */
function backupThatCannotBeOpened() {
  const filePath = path.join(workDir, 'cannot-open.sqlite');
  const db = new Database(filePath);
  db.exec(`
    CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO app_meta VALUES ('db_uuid', 'abc');
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, occurred_at INTEGER);
    INSERT INTO accounts (name) VALUES ('From the backup');
    CREATE TRIGGER refuse_inserts BEFORE INSERT ON app_meta
    BEGIN SELECT RAISE(ABORT, 'refused on purpose'); END;
  `);
  db.close();
  return filePath;
}

const dataDir = () => path.dirname(databaseModule.getDatabasePath());
const previousCopies = () =>
  fs.readdirSync(dataDir()).filter((name) => name.startsWith('db-local-prev'));

async function restoreFrom(filePath) {
  setOpenDialogResult({ canceled: false, filePaths: [filePath] });
  await backupController.selectRestoreFile();
  return backupController.restore({ backupFilePath: filePath });
}

describe('a restore that fails after the files were swapped', () => {
  it('reports the failure', async () => {
    await expect(restoreFrom(backupThatCannotBeOpened())).rejects.toThrow(/refused on purpose/);
  });

  it('brings the previous data back', async () => {
    await restoreFrom(backupThatCannotBeOpened()).catch(() => {});

    expect(liveAccountNames()).toEqual(['Keep me']);
  });

  it('leaves no stranded previous copy behind', async () => {
    await restoreFrom(backupThatCannotBeOpened()).catch(() => {});

    expect(previousCopies()).toEqual([]);
  });

  it('leaves the app with an open, working database', async () => {
    await restoreFrom(backupThatCannotBeOpened()).catch(() => {});

    expect(databaseModule.getDatabase().open).toBe(true);
    expect(() => insertAccounts(databaseModule.getDatabase(), ['After'])).not.toThrow();
  });

  it('tells the renderer the restore failed, not that it completed', async () => {
    await restoreFrom(backupThatCannotBeOpened()).catch(() => {});

    const channels = sentEvents.map((event) => event.channel);
    expect(channels.some((channel) => /restoreFailed/i.test(channel))).toBe(true);
    expect(channels.some((channel) => /restoreCompleted/i.test(channel))).toBe(false);
  });

  it('still allows another restore afterwards', async () => {
    await restoreFrom(backupThatCannotBeOpened()).catch(() => {});
    const good = path.join(workDir, 'good.sqlite');
    databaseModule.getDatabase().exec(`VACUUM INTO '${good.replace(/'/g, "''")}'`);
    databaseModule.getDatabase().prepare("UPDATE accounts SET name = 'Changed'").run();

    await restoreFrom(good);

    expect(liveAccountNames()).toEqual(['Keep me']);
  });
});
