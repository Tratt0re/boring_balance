const fs = require('node:fs');
const { closeDatabase, createDatabase, getDatabasePath, getDatabase } = require('../database/db');
const { deleteRows, touchDatabaseWriteMeta } = require('../database/core_op');
const { initSchema } = require('../database/schema');
const { runMigrations } = require('../database/migrations');
const { runExclusive } = require('../utils/operation-lock');
const { clearSettingsStore } = require('../utils/settings-store');

// Tables cleared in full (no filter) — deleteRows requires a non-empty where,
// so these use direct prepare() calls within the transaction.
const FULL_CLEAR_TABLES = [
  'transfers',
  'transactions',
  'account_valuations',
  'plan_items',
  'budgets',
  'accounts',
];

async function clearFinancialData(_event, _payload) {
  try {
    return await runExclusive('reset', () => clearFinancialDataNow());
  } catch (err) {
    return { ok: false, error: err?.message ?? 'Unknown error' };
  }
}

function clearFinancialDataNow() {
  try {
    const db = getDatabase();
    db.transaction(() => {
      let removedRows = 0;
      for (const table of FULL_CLEAR_TABLES) {
        removedRows += db.prepare(`DELETE FROM "${table}"`).run().changes;
      }
      // Raw deletes skip the bookkeeping that deleteRows does, so record them as one change here:
      // backup and sync use the change counter to decide whether anything needs copying.
      touchDatabaseWriteMeta(db, FULL_CLEAR_TABLES[0], removedRows);
      // Preserve system rows (locked = 1); deleteRows handles filtered deletes.
      deleteRows(db, 'categories', { locked: 0 });
    })();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'Unknown error' };
  }
}

async function factoryReset(_event, _payload) {
  try {
    return await runExclusive('reset', () => factoryResetNow());
  } catch (err) {
    return { ok: false, error: err?.message ?? 'Unknown error' };
  }
}

function factoryResetNow() {
  const dbPath = getDatabasePath();
  const sideSuffixes = ['', '-wal', '-shm'];
  const asideSuffix = `.reset-${Date.now()}`;
  const movedAside = [];

  try {
    closeDatabase();

    // Move the old files aside instead of deleting them: if building the new database fails they go back.
    for (const suffix of sideSuffixes) {
      const source = `${dbPath}${suffix}`;
      if (fs.existsSync(source)) {
        fs.renameSync(source, `${source}${asideSuffix}`);
        movedAside.push(suffix);
      }
    }

    const db = createDatabase();
    initSchema(db);
    runMigrations(db, { isNewDatabase: true, stampOnly: true });
    clearSettingsStore();

    for (const suffix of movedAside) {
      fs.rmSync(`${dbPath}${suffix}${asideSuffix}`, { force: true });
    }

    return { ok: true };
  } catch (err) {
    try {
      closeDatabase();
      for (const suffix of sideSuffixes) {
        fs.rmSync(`${dbPath}${suffix}`, { force: true });
      }
      for (const suffix of movedAside) {
        fs.renameSync(`${dbPath}${suffix}${asideSuffix}`, `${dbPath}${suffix}`);
      }
      createDatabase();
    } catch (recoverError) {
      console.error('[electron] Failed to put the data back after a failed reset:', recoverError);
    }

    return { ok: false, error: err?.message ?? 'Unknown error' };
  }
}

module.exports = { clearFinancialData, factoryReset };
