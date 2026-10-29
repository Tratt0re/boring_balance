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
  sentEvents,
  setOpenDialogResult,
} from './helpers/electron-db.js';

// Removing old backups is housekeeping. If it fails after a new backup was written correctly, the new
// backup is still good: it must be reported as good, with the cleanup problem kept as a warning.

let workDir;
let folder;
let backup;
let databaseModule;

beforeEach(async () => {
  openTestDatabase();
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-prune-'));
  folder = path.join(workDir, 'backups');
  fs.mkdirSync(folder);
  databaseModule = loadElectronModule('electron/database');
  backup = loadFreshElectronModule('electron/controllers/backup.controller.js');
  insertAccounts(databaseModule.getDatabase(), ['A']);

  setOpenDialogResult({ canceled: false, filePaths: [folder] });
  await backup.selectFolder();
  backup.updateSettings({ enabled: true, folderPath: folder, retentionCount: 1 });
});

afterEach(() => {
  vi.restoreAllMocks();
  closeTestDatabase();
  fs.rmSync(workDir, { recursive: true, force: true });
});

const sqliteBackups = () => fs.readdirSync(folder).filter((name) => name.endsWith('.sqlite'));

/** Makes removal of files inside the backup folder fail, as a locked or read-only file would. */
function failRemovingOldBackups() {
  const original = fs.unlinkSync;
  vi.spyOn(fs, 'unlinkSync').mockImplementation((target) => {
    if (String(target).startsWith(folder)) {
      throw new Error('EPERM: operation not permitted');
    }
    return original(target);
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

/** Takes one backup, changes the data, and waits so the next backup gets a new file name. */
async function backupThenChange() {
  await backup.runNow();
  insertAccounts(databaseModule.getDatabase(), [`B${Date.now()}`]);
  await new Promise((resolve) => setTimeout(resolve, 1100));
}

describe('a backup whose cleanup of old backups fails', () => {
  it('still succeeds, and returns the new backup', async () => {
    await backupThenChange();
    failRemovingOldBackups();

    const result = await backup.runNow();

    expect(result.fileName).toMatch(/\.sqlite$/);
    expect(sqliteBackups()).toContain(result.fileName);
  });

  it('is reported as ok, not as an error', async () => {
    await backupThenChange();
    failRemovingOldBackups();

    const result = await backup.runNow();

    const state = backup.getState();
    expect(state.lastBackupStatus).toBe('ok');
    expect(state.lastBackupError).toBeNull();
    expect(state.lastBackupFileName).toBe(result.fileName);
  });

  it('records the cleanup problem as a warning instead', async () => {
    await backupThenChange();
    failRemovingOldBackups();

    await backup.runNow();

    expect(backup.getState().lastCleanupWarning).toMatch(/EPERM/);
  });

  it('logs the cleanup problem', async () => {
    await backupThenChange();
    failRemovingOldBackups();

    await backup.runNow();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('old backups'),
      expect.anything(),
    );
  });

  it('announces a completed backup, and no failure', async () => {
    await backupThenChange();
    failRemovingOldBackups();
    sentEvents.length = 0;

    await backup.runNow();

    const channels = sentEvents.map((event) => event.channel);
    expect(channels).toContain('backup:backupCompleted');
    expect(channels).not.toContain('backup:backupFailed');
  });
});

describe('a backup whose cleanup works', () => {
  it('removes old backups and has no warning', async () => {
    await backupThenChange();

    await backup.runNow();

    expect(sqliteBackups()).toHaveLength(1);
    expect(backup.getState().lastCleanupWarning).toBeNull();
  });

  it('clears an earlier warning once cleanup works again', async () => {
    await backupThenChange();
    failRemovingOldBackups();
    await backup.runNow();
    expect(backup.getState().lastCleanupWarning).not.toBeNull();
    vi.restoreAllMocks();
    insertAccounts(databaseModule.getDatabase(), ['C']);
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await backup.runNow();

    expect(backup.getState().lastCleanupWarning).toBeNull();
  });
});

describe('a backup that really fails', () => {
  it('is still reported as an error', async () => {
    fs.rmSync(folder, { recursive: true, force: true });

    await expect(backup.runNow()).rejects.toThrow();

    expect(backup.getState().lastBackupStatus).toBe('error');
    expect(backup.getState().lastBackupError).toBeTruthy();
  });
});
