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

// Automatic backup that is switched on but has no folder never runs. That used to be completely silent:
// the user believes their data is being backed up when it is not. It is now reported as a warning in
// the backup state, and cleared as soon as a folder is set (or the feature is switched off).

let workDir;
let backup;
let databaseModule;

beforeEach(() => {
  openTestDatabase();
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-notconf-'));
  databaseModule = loadElectronModule('electron/database');
  backup = loadFreshElectronModule('electron/controllers/backup.controller.js');
  insertAccounts(databaseModule.getDatabase(), ['A']);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  closeTestDatabase();
  fs.rmSync(workDir, { recursive: true, force: true });
});

async function configureFolder() {
  const folder = path.join(workDir, 'backups');
  fs.mkdirSync(folder, { recursive: true });
  setOpenDialogResult({ canceled: false, filePaths: [folder] });
  await backup.selectFolder();
  backup.updateSettings({ folderPath: folder });
  return folder;
}

describe('automatic backup that is on but has no folder', () => {
  beforeEach(() => {
    backup.updateSettings({ enabled: true, autoBackupOnQuit: true });
  });

  it('is reported as a warning in the state, naming the cause', () => {
    expect(backup.getState().configurationWarning).toMatch(/folder/i);
  });

  it('is still reported after a skipped quit-time backup', async () => {
    const result = await backup.onAppBeforeQuit();

    expect(result).toBeNull();
    expect(backup.getState().configurationWarning).toMatch(/folder/i);
  });

  it('does not make the backup state an error, since nothing failed', () => {
    expect(backup.getState().lastBackupStatus).toBe('idle');
    expect(backup.getState().lastBackupError).toBeNull();
  });

  it('is logged once, not on every read of the state', () => {
    backup.getState();
    backup.getState();
    backup.getState();

    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('the warning goes away', () => {
  it('when a folder is chosen', async () => {
    backup.updateSettings({ enabled: true });
    expect(backup.getState().configurationWarning).not.toBeNull();

    await configureFolder();

    expect(backup.getState().configurationWarning).toBeNull();
  });

  it('when the feature is switched off', () => {
    backup.updateSettings({ enabled: true });
    expect(backup.getState().configurationWarning).not.toBeNull();

    backup.updateSettings({ enabled: false });

    expect(backup.getState().configurationWarning).toBeNull();
  });

  it('and comes back if the folder is cleared while the feature stays on', async () => {
    await configureFolder();
    backup.updateSettings({ enabled: true });
    expect(backup.getState().configurationWarning).toBeNull();

    backup.updateSettings({ folderPath: null });

    expect(backup.getState().configurationWarning).toMatch(/folder/i);
  });
});

describe('when nothing is wrong', () => {
  it('there is no warning for a backup that is off', () => {
    expect(backup.getState().configurationWarning).toBeNull();
  });

  it('there is no warning for a backup that is on with a folder', async () => {
    await configureFolder();
    backup.updateSettings({ enabled: true });

    expect(backup.getState().configurationWarning).toBeNull();
  });

  it('an automatic backup with a folder still runs normally', async () => {
    await configureFolder();
    backup.updateSettings({ enabled: true, autoBackupOnQuit: true });

    const result = await backup.onAppBeforeQuit();

    expect(result.fileName).toMatch(/\.sqlite$/);
    expect(backup.getState().configurationWarning).toBeNull();
  });
});

describe('reading the state', () => {
  it('does not rewrite the settings file', async () => {
    backup.updateSettings({ enabled: true });
    const settingsFile = loadElectronModule(
      'electron/utils/settings-store.js',
    ).getSettingsFilePath();
    const before = fs.readFileSync(settingsFile, 'utf8');
    const writes = vi.spyOn(fs, 'renameSync');

    backup.getState();
    backup.getState();

    expect(writes).not.toHaveBeenCalled();
    expect(fs.readFileSync(settingsFile, 'utf8')).toBe(before);
  });

  it('can be read repeatedly without announcing a state change each time', () => {
    backup.updateSettings({ enabled: true });
    const sent = [];
    const original = loadElectronModule('electron/ipc/broadcast.js');
    const spy = vi
      .spyOn(original, 'broadcastIpcEvent')
      .mockImplementation((...args) => sent.push(args));

    backup.getState();
    backup.getState();

    expect(sent).toEqual([]);
    spy.mockRestore();
  });
});
