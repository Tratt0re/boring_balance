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

// lastPublishedCounter says "everything up to this change counter is published". It must only move
// when the sync index really points at what this device pushed. If the index was left alone (because
// another device is already ahead), the counter must stay, so the local changes are not forgotten.

let workDir;
let syncFolder;
let sync;
let databaseModule;

beforeEach(async () => {
  openTestDatabase();
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-pushcounter-'));
  syncFolder = path.join(workDir, 'sync');
  fs.mkdirSync(syncFolder);
  databaseModule = loadElectronModule('electron/database');
  sync = loadFreshElectronModule('electron/controllers/sync.controller.js');
  insertAccounts(databaseModule.getDatabase(), ['A']);

  setOpenDialogResult({ canceled: false, filePaths: [syncFolder] });
  await sync.selectFolder();
  sync.updateSettings({ enabled: true, folderPath: syncFolder });
});

afterEach(() => {
  closeTestDatabase();
  fs.rmSync(workDir, { recursive: true, force: true });
});

const indexPath = () => path.join(syncFolder, 'boring-balance.sync', 'sync_index.json');
const readIndex = () => JSON.parse(fs.readFileSync(indexPath(), 'utf8'));
// A write made the way the app makes it, so the change counter moves.
const appWrite = (name) => {
  const { insertRow } = loadElectronModule('electron/database/core_op.js');
  insertRow(databaseModule.getDatabase(), 'accounts', { name, created_at: Date.now() });
};

const published = () => sync.getSettings().lastPublishedCounter;
const localCounter = () =>
  Number(
    databaseModule
      .getDatabase()
      .prepare("SELECT value FROM app_meta WHERE key = 'change_counter'")
      .get().value,
  );

/** Pretends another device pushed a newer state of the same database. */
function advanceIndexAsOtherDevice(by = 50) {
  const index = readIndex();
  index.latest.change_counter += by;
  index.latest.last_write_ms += 1000;
  index.latest.device_id = 'other-device';
  fs.writeFileSync(indexPath(), JSON.stringify(index));
  return index.latest.change_counter;
}

describe('a push that updates the index', () => {
  it('moves the published counter to the pushed change counter', async () => {
    const result = await sync.pushNow();

    expect(result.pushed).toBe(true);
    expect(readIndex().latest.change_counter).toBe(localCounter());
    expect(published()).toBe(localCounter());
  });
});

describe('a push where another device is already ahead', () => {
  it('leaves the index as the other device wrote it', async () => {
    await sync.pushNow();
    const remoteCounter = advanceIndexAsOtherDevice();
    appWrite('B');

    await sync.pushNow();

    expect(readIndex().latest.change_counter).toBe(remoteCounter);
    expect(readIndex().latest.device_id).toBe('other-device');
  });

  it('does not claim the local changes as published', async () => {
    await sync.pushNow();
    const publishedBefore = published();
    advanceIndexAsOtherDevice();
    appWrite('B');

    const result = await sync.pushNow();

    expect(result.indexUpdated).toBe(false);
    expect(published()).toBe(publishedBefore);
  });

  it('so the next automatic push still sees unpublished local changes', async () => {
    await sync.pushNow();
    advanceIndexAsOtherDevice();
    appWrite('B');
    await sync.pushNow();

    sync.updateSettings({ autoPushOnQuit: true });
    const next = await sync.onAppBeforeQuit();

    expect(next?.action).not.toBe('skipped');
  });
});
