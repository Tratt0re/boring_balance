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
  setOpenDialogResult,
} from './helpers/electron-db.js';

// A restore replaces the live database with a file. If that file is not a usable Boring Balance
// database, the swap must be refused BEFORE the live database is closed or moved aside.

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

let workDir;
let backupModel;
let backupController;
let databaseModule;

beforeEach(() => {
  openTestDatabase();
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-validity-'));
  databaseModule = loadElectronModule('electron/database');
  backupModel = loadElectronModule('electron/models/backup.model.js');
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

function writeSqlite(name, sql) {
  const filePath = path.join(workDir, name);
  const db = new Database(filePath);
  db.exec(sql);
  db.close();
  return filePath;
}

function goodBackup() {
  const filePath = path.join(workDir, 'good.sqlite');
  databaseModule.getDatabase().exec(`VACUUM INTO '${filePath.replace(/'/g, "''")}'`);
  return filePath;
}

const cases = {
  'a text file': () => {
    const filePath = path.join(workDir, 'notes.sqlite');
    fs.writeFileSync(filePath, 'this is not a database, just some text '.repeat(200));
    return filePath;
  },
  'an empty file': () => {
    const filePath = path.join(workDir, 'empty.sqlite');
    fs.writeFileSync(filePath, '');
    return filePath;
  },
  'a database without app_meta': () =>
    writeSqlite('other.sqlite', 'CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (1);'),
  'a database whose app_meta has no identity': () =>
    writeSqlite(
      'noid.sqlite',
      'CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE accounts (id INTEGER);',
    ),
  'a database whose identity is blank': () =>
    writeSqlite(
      'blank.sqlite',
      "CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT); INSERT INTO app_meta VALUES ('db_uuid', '   ');",
    ),
  'a database with a damaged table but a readable identity': () => {
    const filePath = path.join(workDir, 'rotten.sqlite');
    const db = new Database(filePath);
    db.exec(
      "CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT); INSERT INTO app_meta VALUES ('db_uuid', 'abc');" +
        'CREATE TABLE filler (id INTEGER PRIMARY KEY, body TEXT); CREATE INDEX filler_body ON filler(body);',
    );
    const insert = db.prepare('INSERT INTO filler (body) VALUES (?)');
    // One transaction: 2000 separate commits are slow on a CI runner's disk and timed out there.
    db.transaction(() => {
      for (let i = 0; i < 2000; i += 1) insert.run(`row-${i}-${'x'.repeat(40)}`);
    })();
    db.close();
    const bytes = fs.readFileSync(filePath);
    // Overwrite the final pages (index/table content), leaving the first pages and app_meta intact.
    bytes.fill(0xff, bytes.length - 8192);
    fs.writeFileSync(filePath, bytes);
    return filePath;
  },
  'a damaged copy of a real backup': () => {
    const filePath = goodBackup();
    const bytes = fs.readFileSync(filePath);
    for (let offset = 4096; offset < bytes.length; offset += 7) {
      bytes[offset] = 0xff;
    }
    fs.writeFileSync(filePath, bytes);
    return filePath;
  },
  'a truncated copy of a real backup': () => {
    const filePath = goodBackup();
    const bytes = fs.readFileSync(filePath);
    fs.writeFileSync(filePath, bytes.subarray(0, Math.floor(bytes.length / 2)));
    return filePath;
  },
};

describe('assertUsableDatabaseFile', () => {
  it('accepts a real backup', () => {
    expect(() => backupModel.assertUsableDatabaseFile(goodBackup())).not.toThrow();
  });

  it.each(Object.keys(cases))('refuses %s', (label) => {
    expect(() => backupModel.assertUsableDatabaseFile(cases[label]())).toThrow(
      /not a usable|not a valid|damaged|database/i,
    );
  });

  it('refuses a path that does not exist, without creating it', () => {
    const missing = path.join(workDir, 'missing.sqlite');

    expect(() => backupModel.assertUsableDatabaseFile(missing)).toThrow();
    expect(fs.existsSync(missing)).toBe(false);
  });

  it('never writes to the file it checks', () => {
    const filePath = goodBackup();
    const before = fs.readFileSync(filePath);

    backupModel.assertUsableDatabaseFile(filePath);

    expect(fs.readFileSync(filePath).equals(before)).toBe(true);
    expect(fs.readdirSync(workDir).filter((name) => name.endsWith('-wal'))).toEqual([]);
  });
});

describe('the check itself', () => {
  it('relies on integrity_check for a damaged table whose identity is still readable', () => {
    const filePath = cases['a database with a damaged table but a readable identity']();
    const db = new Database(filePath, { readonly: true });
    let identityReadable = false;
    try {
      identityReadable = Boolean(
        db.prepare("SELECT value FROM app_meta WHERE key = 'db_uuid'").get(),
      );
    } finally {
      db.close();
    }

    // If the identity were unreadable another check would catch it and this case would prove nothing.
    expect(identityReadable).toBe(true);
    expect(() => backupModel.assertUsableDatabaseFile(filePath)).toThrow(/integrity/i);
  });

  it('does not create side files when checking a database in WAL mode', () => {
    const filePath = writeSqlite(
      'wal.sqlite',
      "PRAGMA journal_mode = WAL; CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT); INSERT INTO app_meta VALUES ('db_uuid', 'abc');",
    );
    const before = fs.readdirSync(workDir).sort();

    backupModel.assertUsableDatabaseFile(filePath);

    expect(fs.readdirSync(workDir).sort()).toEqual(before);
  });
});

describe('the check on special files', () => {
  it('accepts a good backup that is read-only on disk, so the check itself must not write', () => {
    const filePath = goodBackup();
    fs.chmodSync(filePath, 0o444);

    expect(() => backupModel.assertUsableDatabaseFile(filePath)).not.toThrow();
  });

  it('leaves the side files of a database that is open elsewhere alone', () => {
    const filePath = writeSqlite(
      'busy.sqlite',
      "PRAGMA journal_mode = WAL; CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT); INSERT INTO app_meta VALUES ('db_uuid', 'abc');",
    );
    const other = new Database(filePath);
    other.prepare("INSERT INTO app_meta VALUES ('x', 'y')").run();

    try {
      expect(fs.existsSync(`${filePath}-wal`)).toBe(true);

      backupModel.assertUsableDatabaseFile(filePath);

      expect(fs.existsSync(`${filePath}-wal`)).toBe(true);
      expect(fs.existsSync(`${filePath}-shm`)).toBe(true);
    } finally {
      other.close();
    }
  });
});

describe('restoreBackup in the model', () => {
  it.each(Object.keys(cases))('refuses %s before touching the local file', (label) => {
    const filePath = cases[label]();
    const localDbPath = path.join(workDir, 'local.sqlite');
    fs.writeFileSync(localDbPath, 'local data');

    expect(() => backupModel.restoreBackup(filePath, localDbPath)).toThrow();

    expect(fs.readFileSync(localDbPath, 'utf8')).toBe('local data');
    expect(fs.readdirSync(workDir).filter((name) => name.startsWith('db-local-prev'))).toEqual([]);
  });
});

describe('restoring an unusable file', () => {
  it('leaves the live connection open, instead of closing and reopening it', async () => {
    const filePath = cases['a text file']();
    setOpenDialogResult({ canceled: false, filePaths: [filePath] });
    await backupController.selectRestoreFile();
    const liveConnection = databaseModule.getDatabase();

    await backupController.restore({ backupFilePath: filePath }).catch(() => {});

    expect(databaseModule.getDatabase()).toBe(liveConnection);
    expect(liveConnection.open).toBe(true);
  });

  it.each(Object.keys(cases))('is refused for %s and the live data is untouched', async (label) => {
    const filePath = cases[label]();
    setOpenDialogResult({ canceled: false, filePaths: [filePath] });
    await backupController.selectRestoreFile();

    await expect(backupController.restore({ backupFilePath: filePath })).rejects.toThrow();

    expect(liveAccountNames()).toEqual(['Keep me']);
  });

  it('does not move the live database aside', async () => {
    const filePath = cases['a text file']();
    setOpenDialogResult({ canceled: false, filePaths: [filePath] });
    await backupController.selectRestoreFile();
    const dataDir = path.dirname(databaseModule.getDatabasePath());

    await backupController.restore({ backupFilePath: filePath }).catch(() => {});

    expect(fs.readdirSync(dataDir).filter((name) => name.startsWith('db-local-prev'))).toEqual([]);
  });

  it('still restores a good backup', async () => {
    const filePath = goodBackup();
    databaseModule.getDatabase().prepare("UPDATE accounts SET name = 'Changed'").run();
    setOpenDialogResult({ canceled: false, filePaths: [filePath] });
    await backupController.selectRestoreFile();

    await backupController.restore({ backupFilePath: filePath });

    expect(liveAccountNames()).toEqual(['Keep me']);
  });
});
