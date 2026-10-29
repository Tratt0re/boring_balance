import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeTestDatabase,
  insertAccounts,
  loadElectronModule,
  loadFreshElectronModule,
  openTestDatabase,
  setOpenDialogResult,
} from './helpers/electron-db.js';

// When the app is closing and the quit-time backup fails, the controller used to log the error and
// return null, so the caller could not tell. It now returns the failure, so main.js can ask the user
// whether to quit anyway. A quit that succeeds or is not configured reports nothing.

let workDir;
let folder;
let backup;
let databaseModule;

beforeEach(async () => {
  openTestDatabase();
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-quit-'));
  folder = path.join(workDir, 'backups');
  fs.mkdirSync(folder);
  databaseModule = loadElectronModule('electron/database');
  backup = loadFreshElectronModule('electron/controllers/backup.controller.js');
  insertAccounts(databaseModule.getDatabase(), ['A']);
  vi.spyOn(console, 'error').mockImplementation(() => {});

  setOpenDialogResult({ canceled: false, filePaths: [folder] });
  await backup.selectFolder();
});

afterEach(() => {
  vi.restoreAllMocks();
  closeTestDatabase();
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe('the backup quit check', () => {
  it('reports nothing when auto-backup on quit is off', async () => {
    backup.updateSettings({ enabled: true, folderPath: folder, autoBackupOnQuit: false });

    expect(await backup.onAppBeforeQuit()).toBeNull();
  });

  it('reports nothing when the quit backup succeeds', async () => {
    backup.updateSettings({ enabled: true, folderPath: folder, autoBackupOnQuit: true });

    const result = await backup.onAppBeforeQuit();

    expect(result).toBeTruthy();
    expect(result.failed).not.toBe(true);
    expect(result.fileName).toMatch(/\.sqlite$/);
  });

  it('reports the failure, with a readable message, when the quit backup fails', async () => {
    backup.updateSettings({ enabled: true, folderPath: folder, autoBackupOnQuit: true });
    fs.rmSync(folder, { recursive: true, force: true });

    const outcome = await backup.onAppBeforeQuit();

    expect(outcome).toMatchObject({ failed: true, operation: 'backup' });
    expect(outcome.message).toBeTruthy();
    expect(outcome.message).not.toMatch(/undefined|null/);
  });

  it('still logs the failure', async () => {
    backup.updateSettings({ enabled: true, folderPath: folder, autoBackupOnQuit: true });
    fs.rmSync(folder, { recursive: true, force: true });

    await backup.onAppBeforeQuit();

    expect(console.error).toHaveBeenCalled();
  });

  it('is not reported as a failure when nothing changed since the last backup', async () => {
    backup.updateSettings({ enabled: true, folderPath: folder, autoBackupOnQuit: true });
    await backup.onAppBeforeQuit();

    const outcome = await backup.onAppBeforeQuit();

    expect(outcome?.failed).not.toBe(true);
  });
});

describe('the sync quit check', () => {
  let sync;
  let syncFolder;

  beforeEach(async () => {
    syncFolder = path.join(workDir, 'sync');
    fs.mkdirSync(syncFolder);
    sync = loadFreshElectronModule('electron/controllers/sync.controller.js');
    setOpenDialogResult({ canceled: false, filePaths: [syncFolder] });
    await sync.selectFolder();
  });

  it('reports nothing when auto-push on quit is off', async () => {
    sync.updateSettings({ enabled: true, folderPath: syncFolder, autoPushOnQuit: false });

    expect(await sync.onAppBeforeQuit()).toBeNull();
  });

  it('reports the failure, naming sync, when the quit push fails', async () => {
    sync.updateSettings({ enabled: true, folderPath: syncFolder, autoPushOnQuit: true });
    fs.rmSync(syncFolder, { recursive: true, force: true });

    const outcome = await sync.onAppBeforeQuit();

    expect(outcome).toMatchObject({ failed: true, operation: 'sync' });
    expect(outcome.message).toBeTruthy();
  });
});
