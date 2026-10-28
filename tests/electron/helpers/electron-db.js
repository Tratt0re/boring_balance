import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Opens the app's real database layer (electron/database) on a throwaway SQLite file, built from
// the real schemas/*.sql, so model and controller tests exercise the actual SQL, constraints and
// transactions instead of a mock.

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));

let userDataDir = null;
let databaseModule = null;

// electron/database/db.js does `require('electron')` for `app`. Under ELECTRON_RUN_AS_NODE that only
// returns the path of the binary, so install a minimal stand-in before the module is first loaded.
function installElectronStub() {
  const electronPath = require.resolve('electron');
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: { app: { isPackaged: false, getPath: () => userDataDir } },
  };
}

function quietly(fn) {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = originalLog;
  }
}

export function loadElectronModule(relativePath) {
  return require(path.join(projectRoot, relativePath));
}

export function closeTestDatabase() {
  if (databaseModule) {
    quietly(() => databaseModule.closeDatabase());
  }

  if (userDataDir) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
    userDataDir = null;
  }
}

/** Creates a fresh database with the full schema applied and returns the connection. */
export function openTestDatabase() {
  closeTestDatabase();
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-test-'));
  installElectronStub();

  return quietly(() => {
    databaseModule = require(path.join(projectRoot, 'electron/database'));
    const database = databaseModule.createDatabase();
    databaseModule.initSchema(database);
    return database;
  });
}

/** Inserts accounts with the given names and returns their ids in order. */
export function insertAccounts(database, names) {
  const insert = database.prepare('INSERT INTO accounts (name) VALUES (?)');
  return names.map((name) => Number(insert.run(name).lastInsertRowid));
}

export function readChangeCounter(database) {
  const row = database.prepare("SELECT value FROM app_meta WHERE key = 'change_counter'").get();
  return Number(row.value);
}

/** Serializes the given tables plus the change counter, to assert that a failed write left no trace. */
export function snapshotTables(database, tables = ['transfers', 'transactions']) {
  const rows = Object.fromEntries(
    tables.map((table) => [
      table,
      database.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(),
    ]),
  );
  return JSON.stringify({ rows, changeCounter: readChangeCounter(database) });
}
