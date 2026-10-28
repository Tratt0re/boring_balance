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

// Backup, restore, sync and reset all replace or copy the database file. They must never overlap: a
// backup copying the file while a restore swaps it, or a reset deleting it under a running sync.

const lockModule = () => loadFreshElectronModule('electron/utils/operation-lock.js');

describe('the lock', () => {
  it('runs a task and releases the lock afterwards', async () => {
    const { runExclusive } = lockModule();

    expect(await runExclusive('backup', async () => 'done')).toBe('done');
    expect(await runExclusive('restore', async () => 'again')).toBe('again');
  });

  it('refuses a second task while one runs, and names the one in progress', async () => {
    const { runExclusive } = lockModule();
    let release;
    const first = runExclusive('restore', () => new Promise((resolve) => (release = resolve)));

    await expect(runExclusive('backup', async () => 'x')).rejects.toThrow(/restore/i);

    release();
    await first;
  });

  it('releases the lock when the task fails', async () => {
    const { runExclusive } = lockModule();

    await expect(
      runExclusive('sync', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await runExclusive('backup', async () => 'ok')).toBe('ok');
  });

  it('releases the lock when the task throws synchronously', async () => {
    const { runExclusive } = lockModule();

    await expect(
      runExclusive('reset', () => {
        throw new Error('sync boom');
      }),
    ).rejects.toThrow('sync boom');

    expect(await runExclusive('backup', async () => 'ok')).toBe('ok');
  });

  it('reports what is running, and nothing when idle', async () => {
    const { runExclusive, currentOperation } = lockModule();
    expect(currentOperation()).toBeNull();
    let release;
    const running = runExclusive('sync', () => new Promise((resolve) => (release = resolve)));

    expect(currentOperation()).toBe('sync');

    release();
    await running;
    expect(currentOperation()).toBeNull();
  });
});

describe('across the controllers', () => {
  let workDir;
  let databaseModule;
  let backup;
  let reset;
  let operationLock;

  beforeEach(() => {
    openTestDatabase();
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-lock-'));
    databaseModule = loadElectronModule('electron/database');
    // Loaded fresh together, so the controllers and this test share one lock instance.
    operationLock = loadFreshElectronModule('electron/utils/operation-lock.js');
    backup = loadFreshElectronModule('electron/controllers/backup.controller.js');
    reset = loadFreshElectronModule('electron/controllers/reset.controller.js');
    insertAccounts(databaseModule.getDatabase(), ['A']);
  });

  afterEach(() => {
    closeTestDatabase();
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('refuses a reset while another operation holds the lock, and leaves the data alone', async () => {
    let release;
    const holding = operationLock.runExclusive('restore', () => new Promise((r) => (release = r)));

    const result = await reset.factoryReset();
    const cleared = await reset.clearFinancialData();

    release();
    await holding;
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/restore/i);
    expect(cleared.ok).toBe(false);
    expect(databaseModule.getDatabase().prepare('SELECT COUNT(*) AS n FROM accounts').get().n).toBe(
      1,
    );
  });

  it('refuses a manual backup while a reset holds the lock', async () => {
    const folder = path.join(workDir, 'backups');
    fs.mkdirSync(folder);
    setOpenDialogResult({ canceled: false, filePaths: [folder] });
    await backup.selectFolder();
    backup.updateSettings({ enabled: true, folderPath: folder });
    let release;
    const holding = operationLock.runExclusive('reset', () => new Promise((r) => (release = r)));

    await expect(backup.runNow()).rejects.toThrow(/reset/i);

    release();
    await holding;
    expect(fs.readdirSync(folder)).toEqual([]);
  });

  it('refuses a restore while another operation holds the lock, without using up the picked file', async () => {
    const good = path.join(workDir, 'good.sqlite');
    databaseModule.getDatabase().exec(`VACUUM INTO '${good.replace(/'/g, "''")}'`);
    setOpenDialogResult({ canceled: false, filePaths: [good] });
    await backup.selectRestoreFile();
    let release;
    const holding = operationLock.runExclusive('sync', () => new Promise((r) => (release = r)));

    await expect(backup.restore({ backupFilePath: good })).rejects.toThrow(/sync/i);

    release();
    await holding;
    // The refused attempt must not have consumed the pick: the restore now goes through.
    await expect(backup.restore({ backupFilePath: good })).resolves.toBeTruthy();
  });

  it('refuses a sync task while another operation holds the lock', async () => {
    const folder = path.join(workDir, 'sync');
    fs.mkdirSync(folder);
    setOpenDialogResult({ canceled: false, filePaths: [folder] });
    const sync = loadFreshElectronModule('electron/controllers/sync.controller.js');
    await sync.selectFolder();
    sync.updateSettings({ enabled: true, folderPath: folder });
    let release;
    const holding = operationLock.runExclusive('restore', () => new Promise((r) => (release = r)));

    await expect(sync.pullNow()).rejects.toThrow(/restore/i);

    release();
    await holding;
  });

  it('allows a backup again once the lock is released', async () => {
    const folder = path.join(workDir, 'backups');
    fs.mkdirSync(folder);
    setOpenDialogResult({ canceled: false, filePaths: [folder] });
    await backup.selectFolder();
    backup.updateSettings({ enabled: true, folderPath: folder });

    await backup.runNow();

    expect(fs.readdirSync(folder).length).toBeGreaterThan(0);
  });
});
