const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const PROD_DB_FILENAME = 'expense-tracker.db';
const DEV_DB_FILENAME = 'expense-tracker.dev.db';
const APP_STORAGE_DIR_NAME = 'expense_tracker';

let db = null;

function resolveDatabaseFilename() {
  const normalizedOverride = process.env.EXPENSE_TRACKER_DB_ENV?.trim().toLowerCase();

  if (normalizedOverride === 'prod' || normalizedOverride === 'production') {
    return PROD_DB_FILENAME;
  }

  if (normalizedOverride === 'dev' || normalizedOverride === 'development') {
    return DEV_DB_FILENAME;
  }

  return app.isPackaged ? PROD_DB_FILENAME : DEV_DB_FILENAME;
}

function getDatabasePath() {
  const dataDir = path.join(app.getPath('appData'), APP_STORAGE_DIR_NAME, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, resolveDatabaseFilename());
}

function createDatabase() {
  if (db) {
    return db;
  }

  const databasePath = getDatabasePath();
  db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  console.log('[electron] Database ready ->', databasePath);
  return db;
}

function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call createDatabase() first.');
  }

  return db;
}

function closeDatabase() {
  if (!db) {
    return;
  }

  db.close();
  db = null;

  console.log('[electron] Database closed');
}

module.exports = {
  closeDatabase,
  createDatabase,
  getDatabase,
  getDatabasePath,
};
