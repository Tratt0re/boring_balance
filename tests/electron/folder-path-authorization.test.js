import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeTestDatabase,
  loadFreshElectronModule,
  openTestDatabase,
  setOpenDialogResult,
} from './helpers/electron-db.js';

// Backup and sync write files into a folder. The renderer must not name that folder itself: it has
// to be the one the user chose in the native folder dialog, or the one already saved in the settings.

const refused = /choose|picker|not allowed/i;

let workDir;
let pickedFolder;
let otherFolder;
let backup;
let sync;

beforeEach(() => {
  openTestDatabase();
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-folders-'));
  pickedFolder = path.join(workDir, 'picked');
  otherFolder = path.join(workDir, 'other');
  fs.mkdirSync(pickedFolder);
  fs.mkdirSync(otherFolder);
  backup = loadFreshElectronModule('electron/controllers/backup.controller.js');
  sync = loadFreshElectronModule('electron/controllers/sync.controller.js');
});

afterEach(() => {
  closeTestDatabase();
  fs.rmSync(workDir, { recursive: true, force: true });
});

const pick = (folder) => setOpenDialogResult({ canceled: false, filePaths: [folder] });

describe('backup folder', () => {
  it('is refused when nobody picked it', () => {
    expect(() => backup.updateSettings({ folderPath: otherFolder })).toThrow(refused);
    expect(backup.getSettings().folderPath).toBeNull();
  });

  it('is accepted once the user picked it', async () => {
    pick(pickedFolder);
    await backup.selectFolder();

    backup.updateSettings({ folderPath: pickedFolder });

    expect(backup.getSettings().folderPath).toBe(pickedFolder);
  });

  it('accepts the picked folder spelled differently', async () => {
    pick(pickedFolder);
    await backup.selectFolder();

    backup.updateSettings({ folderPath: `${pickedFolder}${path.sep}.${path.sep}` });

    expect(backup.getSettings().folderPath).toBeTruthy();
  });

  it('refuses a different folder after one was picked', async () => {
    pick(pickedFolder);
    await backup.selectFolder();

    expect(() => backup.updateSettings({ folderPath: otherFolder })).toThrow(refused);
    expect(() =>
      backup.updateSettings({ folderPath: path.join(pickedFolder, '..', 'other') }),
    ).toThrow(refused);
  });

  it('forgets the pick when a later dialog is cancelled', async () => {
    pick(pickedFolder);
    await backup.selectFolder();
    setOpenDialogResult({ canceled: true, filePaths: [] });
    await backup.selectFolder();

    expect(() => backup.updateSettings({ folderPath: pickedFolder })).toThrow(refused);
  });

  it('keeps the saved folder usable without picking it again', async () => {
    pick(pickedFolder);
    await backup.selectFolder();
    backup.updateSettings({ folderPath: pickedFolder });

    const fresh = loadFreshElectronModule('electron/controllers/backup.controller.js');
    fresh.updateSettings({ folderPath: pickedFolder, retentionCount: 5 });

    expect(fresh.getSettings().folderPath).toBe(pickedFolder);
  });

  it('can be cleared without picking anything', async () => {
    pick(pickedFolder);
    await backup.selectFolder();
    backup.updateSettings({ folderPath: pickedFolder });

    backup.updateSettings({ folderPath: null });

    expect(backup.getSettings().folderPath).toBeNull();
  });

  it('leaves other settings changes alone', () => {
    backup.updateSettings({ retentionCount: 5 });
    expect(backup.getSettings().retentionCount).toBe(5);
  });
});

describe('sync folder', () => {
  it('is refused in the settings when nobody picked it', () => {
    expect(() => sync.updateSettings({ folderPath: otherFolder })).toThrow(refused);
    expect(() => sync.updateSettings({ baseFolderPath: otherFolder })).toThrow(refused);
    expect(sync.getSettings().folderPath).toBeNull();
  });

  it('is accepted in the settings once the user picked it', async () => {
    pick(pickedFolder);
    await sync.selectFolder();

    sync.updateSettings({ folderPath: pickedFolder });

    expect(sync.getSettings().folderPath).toBe(pickedFolder);
  });

  it('is refused by repoStatus when nobody picked it', () => {
    expect(() => sync.repoStatus(otherFolder)).toThrow(refused);
    expect(() => sync.repoStatus({ folderPath: otherFolder })).toThrow(refused);
    expect(() => sync.repoStatus({ baseFolderPath: otherFolder })).toThrow(refused);
  });

  it('is accepted by repoStatus once picked', async () => {
    pick(pickedFolder);
    await sync.selectFolder();

    expect(sync.repoStatus(pickedFolder).exists).toBe(false);
    expect(sync.repoStatus({ folderPath: pickedFolder }).exists).toBe(false);
  });

  it('is refused by enable when nobody picked it, and nothing is created there', async () => {
    const result = await sync.enable({ folderPath: otherFolder }).catch((error) => error);

    expect(JSON.stringify(result instanceof Error ? result.message : result)).toMatch(refused);
    expect(fs.readdirSync(otherFolder)).toEqual([]);
    expect(sync.getSettings().enabled).toBe(false);
  });

  it('refuses a different folder after one was picked', async () => {
    pick(pickedFolder);
    await sync.selectFolder();

    expect(() => sync.updateSettings({ folderPath: otherFolder })).toThrow(refused);
    expect(() => sync.repoStatus(otherFolder)).toThrow(refused);
  });

  it('keeps the saved folder usable without picking it again', async () => {
    pick(pickedFolder);
    await sync.selectFolder();
    sync.updateSettings({ folderPath: pickedFolder });

    const fresh = loadFreshElectronModule('electron/controllers/sync.controller.js');

    expect(fresh.repoStatus().exists).toBe(false);
    expect(() => fresh.repoStatus(pickedFolder)).not.toThrow();
    expect(() => fresh.updateSettings({ folderPath: pickedFolder })).not.toThrow();
  });

  it('can be cleared without picking anything', async () => {
    pick(pickedFolder);
    await sync.selectFolder();
    sync.updateSettings({ folderPath: pickedFolder });

    sync.updateSettings({ folderPath: null });

    expect(sync.getSettings().folderPath).toBeNull();
  });
});
