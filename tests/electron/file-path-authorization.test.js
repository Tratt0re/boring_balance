import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeTestDatabase,
  getOpenDialogCalls,
  insertAccounts,
  loadElectronModule,
  loadFreshElectronModule,
  openTestDatabase,
  sentEvents,
  setOpenDialogResult,
} from './helpers/electron-db.js';

// The renderer is not trusted with file paths. A restore or an import may only touch a file the user
// picked in a native dialog, or (for restore) a backup that sits in the configured backup folder.

const IMPORT_TEMPLATE = path.resolve('electron/files/boring-balance-import-template.xlsx');

let workDir;
let backupFolder;
let desktop;
let backupController;
let importController;
let backupModel;
let databaseModule;

beforeEach(() => {
  openTestDatabase();
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-paths-'));
  backupFolder = path.join(workDir, 'backups');
  desktop = path.join(workDir, 'Desktop');
  fs.mkdirSync(backupFolder);
  fs.mkdirSync(desktop);

  databaseModule = loadElectronModule('electron/database');
  backupModel = loadElectronModule('electron/models/backup.model.js');
  backupController = loadFreshElectronModule('electron/controllers/backup.controller.js');
  importController = loadFreshElectronModule('electron/controllers/import-excel.controller.js');
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

/** Makes a backup of the current data in `folder` and returns its path. */
async function makeBackup(folder) {
  const result = await backupModel.createBackup(databaseModule.getDatabase(), folder, '1.0.2');
  return path.join(folder, result.fileName);
}

/** Seeds "Original", backs it up into `folder`, then changes the live data to "Changed". */
async function backupThenChangeData(folder) {
  insertAccounts(databaseModule.getDatabase(), ['Original']);
  const backupPath = await makeBackup(folder);
  databaseModule.getDatabase().prepare("UPDATE accounts SET name = 'Changed'").run();
  expect(liveAccountNames()).toEqual(['Changed']);
  return backupPath;
}

// Same path the UI takes: the user picks the folder in the dialog, then the settings are saved.
async function configureBackupFolder(folder) {
  setOpenDialogResult({ canceled: false, filePaths: [folder] });
  await backupController.selectFolder();
  backupController.updateSettings({ enabled: true, folderPath: folder });
}

const pick = (...filePaths) => setOpenDialogResult({ canceled: false, filePaths });

describe('backup restore', () => {
  describe('selectRestoreFile', () => {
    it('opens a native file dialog and returns the chosen file', async () => {
      const file = path.join(desktop, 'my-old-backup.sqlite');
      fs.writeFileSync(file, 'x');
      pick(file);

      const result = await backupController.selectRestoreFile();

      expect(result).toEqual({ filePath: file, fileName: 'my-old-backup.sqlite' });
      expect(getOpenDialogCalls()).toHaveLength(1);
      expect(getOpenDialogCalls()[0].properties).toEqual(['openFile']);
    });

    it('returns null when the dialog is canceled or returns nothing', async () => {
      setOpenDialogResult({ canceled: true, filePaths: [] });
      await expect(backupController.selectRestoreFile()).resolves.toBeNull();

      pick();
      await expect(backupController.selectRestoreFile()).resolves.toBeNull();
    });
  });

  describe('a file chosen with the picker', () => {
    it('restores from any location, such as the Desktop', async () => {
      const original = await backupThenChangeData(desktop);
      pick(original);
      await backupController.selectRestoreFile();

      const result = await backupController.restore({ backupFilePath: original });

      expect(liveAccountNames()).toEqual(['Original']);
      expect(result.restoredFrom).toBe(original);
      expect(sentEvents.map((event) => event.channel)).toContain('backup:restoreCompleted');
    });

    it('restores a file with any name and extension', async () => {
      const original = await backupThenChangeData(desktop);
      const renamed = path.join(desktop, 'Copy of finances (final).db');
      fs.renameSync(original, renamed);
      pick(renamed);
      await backupController.selectRestoreFile();

      await backupController.restore({ backupFilePath: renamed });

      expect(liveAccountNames()).toEqual(['Original']);
    });

    it('accepts the path with different spelling of the same file', async () => {
      const original = await backupThenChangeData(desktop);
      pick(original);
      await backupController.selectRestoreFile();
      // String concatenation on purpose: path.join would tidy the segments before the controller sees them.
      const respelled = `${desktop}${path.sep}..${path.sep}Desktop${path.sep}.${path.sep}${path.basename(original)}`;
      expect(respelled).not.toBe(original);

      await backupController.restore({ backupFilePath: respelled });

      expect(liveAccountNames()).toEqual(['Original']);
    });

    it('only authorizes the file that was picked, not its neighbours', async () => {
      const picked = await backupThenChangeData(desktop);
      const other = path.join(desktop, 'other.sqlite');
      fs.copyFileSync(picked, other);
      pick(picked);
      await backupController.selectRestoreFile();

      await expect(backupController.restore({ backupFilePath: other })).rejects.toThrow(
        /chosen with the file picker|backup folder/i,
      );

      expect(liveAccountNames()).toEqual(['Changed']);
    });

    it('a new pick replaces the previous authorization', async () => {
      const first = await backupThenChangeData(desktop);
      const second = path.join(desktop, 'second.sqlite');
      fs.copyFileSync(first, second);
      pick(first);
      await backupController.selectRestoreFile();
      pick(second);
      await backupController.selectRestoreFile();

      await expect(backupController.restore({ backupFilePath: first })).rejects.toThrow();
      expect(liveAccountNames()).toEqual(['Changed']);

      await backupController.restore({ backupFilePath: second });
      expect(liveAccountNames()).toEqual(['Original']);
    });

    it('a canceled dialog does not authorize anything and clears an earlier pick', async () => {
      const original = await backupThenChangeData(desktop);
      pick(original);
      await backupController.selectRestoreFile();
      setOpenDialogResult({ canceled: true, filePaths: [] });
      await backupController.selectRestoreFile();

      await expect(backupController.restore({ backupFilePath: original })).rejects.toThrow();

      expect(liveAccountNames()).toEqual(['Changed']);
    });

    it('is single use: after a restore the same file needs to be picked again', async () => {
      const original = await backupThenChangeData(desktop);
      pick(original);
      await backupController.selectRestoreFile();
      await backupController.restore({ backupFilePath: original });
      databaseModule.getDatabase().prepare("UPDATE accounts SET name = 'Changed again'").run();

      await expect(backupController.restore({ backupFilePath: original })).rejects.toThrow();

      expect(liveAccountNames()).toEqual(['Changed again']);
    });
  });

  describe('a file nobody picked', () => {
    it.each([
      ['an arbitrary path on disk', (desktopDir) => path.join(desktopDir, 'planted.sqlite')],
      ['a system file', () => '/etc/hosts'],
      ['a relative path', () => 'planted.sqlite'],
      ['a path that does not exist', () => path.join(os.tmpdir(), 'does-not-exist.sqlite')],
    ])('is refused: %s', async (_label, buildPath) => {
      const original = await backupThenChangeData(backupFolder);
      fs.copyFileSync(original, path.join(desktop, 'planted.sqlite'));
      await configureBackupFolder(backupFolder);

      await expect(
        backupController.restore({ backupFilePath: buildPath(desktop) }),
      ).rejects.toThrow(/chosen with the file picker|backup folder/i);

      expect(liveAccountNames()).toEqual(['Changed']);
    });

    it('is refused before the live database is touched', async () => {
      const original = await backupThenChangeData(desktop);
      const liveBefore = fs.statSync(databaseModule.getDatabasePath()).mtimeMs;

      await expect(backupController.restore({ backupFilePath: original })).rejects.toThrow();

      expect(fs.statSync(databaseModule.getDatabasePath()).mtimeMs).toBe(liveBefore);
      expect(fs.readdirSync(path.dirname(databaseModule.getDatabasePath())).join()).not.toMatch(
        /db-local-prev/,
      );
      expect(sentEvents.map((event) => event.channel)).not.toContain('backup:restoreCompleted');
    });

    it.each([[undefined], [null], [''], ['   '], [42], [{}]])(
      'rejects a payload of %j',
      async (backupFilePath) => {
        await expect(backupController.restore({ backupFilePath })).rejects.toThrow();
        await expect(backupController.restore(backupFilePath)).rejects.toThrow();
      },
    );
  });

  describe('a backup in the configured backup folder', () => {
    it('can be restored without picking it, as the list in the UI does', async () => {
      const original = await backupThenChangeData(backupFolder);
      await configureBackupFolder(backupFolder);

      await backupController.restore({ backupFilePath: original });

      expect(liveAccountNames()).toEqual(['Original']);
    });

    it('is not restorable when no backup folder is configured', async () => {
      const original = await backupThenChangeData(backupFolder);

      await expect(backupController.restore({ backupFilePath: original })).rejects.toThrow();

      expect(liveAccountNames()).toEqual(['Changed']);
    });

    it('must look like a backup the app created', async () => {
      const original = await backupThenChangeData(backupFolder);
      const imposter = path.join(backupFolder, 'notes.sqlite');
      const wrongSuffix = path.join(backupFolder, `${path.basename(original, '.sqlite')}.txt`);
      fs.copyFileSync(original, imposter);
      fs.copyFileSync(original, wrongSuffix);
      await configureBackupFolder(backupFolder);

      await expect(backupController.restore({ backupFilePath: imposter })).rejects.toThrow();
      await expect(backupController.restore({ backupFilePath: wrongSuffix })).rejects.toThrow();

      expect(liveAccountNames()).toEqual(['Changed']);
    });

    it('cannot be used to reach files outside the folder with ..', async () => {
      const original = await backupThenChangeData(desktop);
      const name = path.basename(original);
      const outside = path.join(backupFolder, '..', 'Desktop', name);
      await configureBackupFolder(backupFolder);

      await expect(backupController.restore({ backupFilePath: outside })).rejects.toThrow();

      expect(liveAccountNames()).toEqual(['Changed']);
    });

    it('does not accept a sibling folder whose name starts like the backup folder', async () => {
      const lookalike = `${backupFolder}-evil`;
      fs.mkdirSync(lookalike);
      const original = await backupThenChangeData(lookalike);
      await configureBackupFolder(backupFolder);

      await expect(backupController.restore({ backupFilePath: original })).rejects.toThrow();

      expect(liveAccountNames()).toEqual(['Changed']);
    });
  });

  describe('delete keeps its own, stricter rule', () => {
    it('refuses to delete a file chosen with the picker, because it is outside the backup folder', async () => {
      const original = await backupThenChangeData(desktop);
      await configureBackupFolder(backupFolder);
      pick(original);
      await backupController.selectRestoreFile();

      expect(() => backupController.remove({ backupFilePath: original })).toThrow(
        /inside the configured backup folder/i,
      );

      expect(fs.existsSync(original)).toBe(true);
    });
  });
});

describe('Excel import', () => {
  beforeEach(() => {
    insertAccounts(databaseModule.getDatabase(), ['Cash']);
  });

  it('selectFile returns the chosen path and opens a native dialog', async () => {
    pick(IMPORT_TEMPLATE);

    await expect(importController.selectFile()).resolves.toEqual({ filePath: IMPORT_TEMPLATE });

    expect(getOpenDialogCalls()[0].properties).toEqual(['openFile']);
  });

  it('selectFile returns null when canceled', async () => {
    setOpenDialogResult({ canceled: true, filePaths: [] });
    await expect(importController.selectFile()).resolves.toBeNull();
  });

  it('validates and commits the file that was picked', async () => {
    pick(IMPORT_TEMPLATE);
    const { filePath } = await importController.selectFile();

    const validation = await importController.validate(filePath);
    const commit = await importController.commit(filePath);

    expect(validation).toHaveProperty('ok');
    expect(validation.errors.map((error) => error.code)).not.toContain('FILE_NOT_SELECTED');
    expect(commit.errors?.map((error) => error.code) ?? []).not.toContain('FILE_NOT_SELECTED');
  });

  it('accepts a different spelling of the picked path', async () => {
    pick(IMPORT_TEMPLATE);
    await importController.selectFile();
    const respelled = `${path.dirname(IMPORT_TEMPLATE)}${path.sep}.${path.sep}${path.basename(IMPORT_TEMPLATE)}`;
    expect(respelled).not.toBe(IMPORT_TEMPLATE);

    const validation = await importController.validate(respelled);

    expect(validation.errors.map((error) => error.code)).not.toContain('FILE_NOT_SELECTED');
  });

  describe('a file nobody picked', () => {
    it.each([['validate'], ['commit']])(
      '%s refuses it with a regular import error, and reads nothing',
      async (action) => {
        const result = await importController[action](IMPORT_TEMPLATE);

        expect(result.ok).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatchObject({ code: 'FILE_NOT_SELECTED', sheet: 'workbook' });
      },
    );

    it('does not write anything to the database when commit is refused', async () => {
      const before = databaseModule
        .getDatabase()
        .prepare('SELECT COUNT(*) c FROM accounts')
        .get().c;

      await importController.commit(IMPORT_TEMPLATE);

      expect(databaseModule.getDatabase().prepare('SELECT COUNT(*) c FROM accounts').get().c).toBe(
        before,
      );
    });

    it('refuses a different file than the one picked', async () => {
      const other = path.join(desktop, 'other.xlsx');
      fs.copyFileSync(IMPORT_TEMPLATE, other);
      pick(IMPORT_TEMPLATE);
      await importController.selectFile();

      const result = await importController.validate(other);

      expect(result.errors[0].code).toBe('FILE_NOT_SELECTED');
    });

    it('refuses everything again after the dialog is canceled', async () => {
      pick(IMPORT_TEMPLATE);
      await importController.selectFile();
      setOpenDialogResult({ canceled: true, filePaths: [] });
      await importController.selectFile();

      const result = await importController.validate(IMPORT_TEMPLATE);

      expect(result.errors[0].code).toBe('FILE_NOT_SELECTED');
    });

    it.each([[undefined], [null], [''], [42], [{}], [['/etc/passwd']]])(
      'refuses a payload of %j',
      async (payload) => {
        const result = await importController.validate(payload);

        expect(result.ok).toBe(false);
        expect(result.errors[0].code).toBe('FILE_NOT_SELECTED');
      },
    );
  });
});
