const fs = require('node:fs');
const { closeDatabase, createDatabase, getDatabasePath, getDatabase } = require('../database/db');
const { deleteRows } = require('../database/core_op');
const { initSchema } = require('../database/schema');
const { runMigrations } = require('../database/migrations');
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

function clearFinancialData(_event, _payload) {
  try {
    const db = getDatabase();
    db.transaction(() => {
      for (const table of FULL_CLEAR_TABLES) {
        db.prepare(`DELETE FROM "${table}"`).run();
      }
      // Preserve system rows (locked = 1); deleteRows handles filtered deletes.
      deleteRows(db, 'categories', { locked: 0 });
    })();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'Unknown error' };
  }
}

function factoryReset(_event, _payload) {
  try {
    const dbPath = getDatabasePath();
    closeDatabase();
    clearSettingsStore();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
    const db = createDatabase();
    initSchema(db);
    runMigrations(db);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'Unknown error' };
  }
}

module.exports = { clearFinancialData, factoryReset };
