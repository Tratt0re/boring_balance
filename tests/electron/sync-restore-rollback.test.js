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
  setOpenDialogResult,
} from './helpers/electron-db.js';

// Pulling a snapshot from the sync folder swaps the live database file, like a restore does. If the
// pulled file cannot be opened afterwards, the user's previous data must come back.

let workDir;
let syncFolder;
let sync;
let databaseModule;

beforeEach(async () => {
  openTestDatabase();
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-syncroll-'));
  syncFolder = path.join(workDir, 'sync');
  fs.mkdirSync(syncFolder);
  databaseModule = loadElectronModule('electron/database');
  sync = loadFreshElectronModule('electron/controllers/sync.controller.js');
  insertAccounts(databaseModule.getDatabase(), ['Keep me']);

  setOpenDialogResult({ canceled: false, filePaths: [syncFolder] });
  await sync.selectFolder();
  sync.updateSettings({ enabled: true, folderPath: syncFolder });
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

/** A complete copy of the live data stored as a snapshot, optionally unopenable for the app. */
function makeSnapshot({ readOnly }) {
  const live = databaseModule.getDatabase();
  const meta = Object.fromEntries(
    live
      .prepare('SELECT key, value FROM app_meta')
      .all()
      .map((row) => [row.key, row.value]),
  );
  const snapshotsDir = path.join(syncFolder, 'boring-balance.sync', 'snapshots');
  fs.mkdirSync(snapshotsDir, { recursive: true });
  const fileName = `snap_${meta.db_uuid}_${meta.change_counter}_${Date.now()}_deviceA.sqlite`;
  const filePath = path.join(snapshotsDir, fileName);
  live.exec(`VACUUM INTO '${filePath.replace(/'/g, "''")}'`);
  live.prepare("UPDATE accounts SET name = 'Changed after snapshot'").run();
  if (readOnly) {
    fs.chmodSync(filePath, 0o444);
  }
  return filePath;
}

const dataDir = () => path.dirname(databaseModule.getDatabasePath());
const previousCopies = () =>
  fs.readdirSync(dataDir()).filter((name) => name.startsWith('db-local-prev'));

describe('choosing a snapshot as the local data', () => {
  it('works for a normal snapshot', async () => {
    const snapshot = makeSnapshot({ readOnly: false });

    await sync.setDefaultSnapshot({ snapshotFilePath: snapshot });

    expect(liveAccountNames()).toEqual(['Keep me']);
  });

  it('reports the failure when the snapshot cannot be opened', async () => {
    const snapshot = makeSnapshot({ readOnly: true });

    await expect(sync.setDefaultSnapshot({ snapshotFilePath: snapshot })).rejects.toThrow();
  });

  it('brings the previous data back when the snapshot cannot be opened', async () => {
    const snapshot = makeSnapshot({ readOnly: true });

    await sync.setDefaultSnapshot({ snapshotFilePath: snapshot }).catch(() => {});

    expect(liveAccountNames()).toEqual(['Changed after snapshot']);
    expect(previousCopies()).toEqual([]);
  });

  it('leaves an open, working database when the snapshot cannot be opened', async () => {
    const snapshot = makeSnapshot({ readOnly: true });

    await sync.setDefaultSnapshot({ snapshotFilePath: snapshot }).catch(() => {});

    expect(databaseModule.getDatabase().open).toBe(true);
    expect(() => insertAccounts(databaseModule.getDatabase(), ['After'])).not.toThrow();
  });
});
