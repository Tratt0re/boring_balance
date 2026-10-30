import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeTestDatabase,
  getOpenDialogCalls,
  loadFreshElectronModule,
  openTestDatabase,
  setOpenDialogResult,
} from './helpers/electron-db.js';

// Electron 43 and later open file dialogs in the Downloads folder unless the app passes a default path.
// The backup folder, restore file and sync folder pickers must start where the user already works:
// in the folder they chose before, or in Documents the first time.

let workDir;
let backup;
let sync;

beforeEach(() => {
  openTestDatabase();
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-picker-'));
  backup = loadFreshElectronModule('electron/controllers/backup.controller.js');
  sync = loadFreshElectronModule('electron/controllers/sync.controller.js');
  setOpenDialogResult({ canceled: true, filePaths: [] });
});

afterEach(() => {
  closeTestDatabase();
  fs.rmSync(workDir, { recursive: true, force: true });
});

const lastDialog = () => getOpenDialogCalls().at(-1);

describe('backup pickers', () => {
  it('start in the documents folder when no backup folder is configured', async () => {
    await backup.selectFolder();
    await backup.selectRestoreFile();

    const [folderDialog, restoreDialog] = getOpenDialogCalls();
    expect(folderDialog.defaultPath).toBeTruthy();
    expect(restoreDialog.defaultPath).toBe(folderDialog.defaultPath);
  });

  it('start in the configured backup folder', async () => {
    const folder = path.join(workDir, 'backups');
    fs.mkdirSync(folder);
    setOpenDialogResult({ canceled: false, filePaths: [folder] });
    await backup.selectFolder();
    backup.updateSettings({ enabled: true, folderPath: folder });
    setOpenDialogResult({ canceled: true, filePaths: [] });

    await backup.selectFolder();
    expect(lastDialog().defaultPath).toBe(folder);

    await backup.selectRestoreFile();
    expect(lastDialog().defaultPath).toBe(folder);
  });
});

describe('sync folder picker', () => {
  it('starts in the documents folder when no sync folder is configured', async () => {
    await sync.selectFolder();

    expect(lastDialog().defaultPath).toBeTruthy();
  });

  it('starts in the configured sync folder', async () => {
    const folder = path.join(workDir, 'sync');
    fs.mkdirSync(folder);
    setOpenDialogResult({ canceled: false, filePaths: [folder] });
    await sync.selectFolder();
    sync.updateSettings({ enabled: true, folderPath: folder });
    setOpenDialogResult({ canceled: true, filePaths: [] });

    await sync.selectFolder();

    expect(lastDialog().defaultPath).toBe(folder);
  });
});
