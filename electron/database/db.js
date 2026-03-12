const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const PROD_DB_FILENAME = 'boringbalance.db';
const DEV_DB_FILENAME = 'boringbalance.dev.db';

let db = null;

function resolveDatabaseFilename() {
  const normalizedOverride = process.env.BORINGBALANCE_DB_ENV?.trim().toLowerCase();

  if (normalizedOverride === 'prod' || normalizedOverride === 'production') {
    return PROD_DB_FILENAME;
  }

  if (normalizedOverride === 'dev' || normalizedOverride === 'development') {
    return DEV_DB_FILENAME;
  }

  return app.isPackaged ? PROD_DB_FILENAME : DEV_DB_FILENAME;
}

function getDatabasePath() {
  const dataDir = path.join(app.getPath('userData'), 'data');
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
