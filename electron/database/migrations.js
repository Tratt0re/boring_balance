const fs = require('node:fs');
const path = require('node:path');
const { formatTimestampForFilename } = require('../utils/file-utils');
const { ensureRequiredAppMeta } = require('./schema');

// Migrations are numbered files (NNN_name.sql) applied once each, in order. How far a database has got
// is stored in PRAGMA user_version, which lives inside the SQLite file and so travels with backups and
// sync snapshots. The files in schemas/ always describe the LATEST schema: a new database is built from
// them and stamped as up to date, while an older database catches up through the files below.

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_FILE_PATTERN = /^(\d+)_.+\.sql$/;

function listMigrations(migrationsDir = MIGRATIONS_DIR) {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const migrations = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({ name: entry.name, match: MIGRATION_FILE_PATTERN.exec(entry.name) }))
    .filter(({ match }) => match !== null)
    .map(({ name, match }) => ({
      name,
      version: Number(match[1]),
      filePath: path.join(migrationsDir, name),
    }))
    .sort((a, b) => a.version - b.version);

  for (let index = 1; index < migrations.length; index += 1) {
    if (migrations[index].version === migrations[index - 1].version) {
      throw new Error(
        `Two migration files have the same number: ${migrations[index - 1].name} and ${migrations[index].name}.`,
      );
    }
  }

  return migrations;
}

function getMigrationFilePaths(migrationsDir = MIGRATIONS_DIR) {
  return listMigrations(migrationsDir).map((migration) => migration.filePath);
}

function latestVersionOf(migrations) {
  return migrations.length === 0 ? 0 : migrations[migrations.length - 1].version;
}

const LATEST_MIGRATION_VERSION = latestVersionOf(listMigrations());

function resolveDefaultDatabasePath() {
  return require('./db').getDatabasePath();
}

/** Copies the database next to itself before it is changed. VACUUM INTO also captures the WAL. */
function copyDatabaseAside(database, databasePath) {
  const directory = path.dirname(databasePath);
  const stamp = formatTimestampForFilename();
  let copyPath = path.join(directory, `db-pre-migration-${stamp}.sqlite`);
  let index = 1;
  while (fs.existsSync(copyPath)) {
    copyPath = path.join(directory, `db-pre-migration-${stamp}-${index}.sqlite`);
    index += 1;
  }

  try {
    database.prepare('VACUUM INTO ?').run(copyPath);
  } catch (error) {
    throw new Error(
      `Could not copy the database before migrating it, so nothing was changed: ${error.message}`,
    );
  }

  return copyPath;
}

/**
 * Brings `database` up to date.
 *
 * @param {import('better-sqlite3').Database} database
 * @param {{ migrationsDir?: string, databasePath?: string, isNewDatabase?: boolean,
 *   stampOnly?: boolean }} [options] `isNewDatabase` skips the safety copy (there is no data yet);
 *   `stampOnly` marks the database as current without applying anything (it was just built from the
 *   latest schema files).
 */
function runMigrations(database, options = {}) {
  const migrations = listMigrations(options.migrationsDir);
  const latestVersion = latestVersionOf(migrations);
  const currentVersion = Number(database.pragma('user_version', { simple: true }));

  if (currentVersion > latestVersion) {
    throw new Error(
      `This data was saved by a newer version of Boring Balance (schema ${currentVersion}, this app knows up to ${latestVersion}). Update the app to open it.`,
    );
  }

  if (options.stampOnly) {
    if (currentVersion !== latestVersion) {
      database.pragma(`user_version = ${latestVersion}`);
    }
  } else {
    const pending = migrations.filter((migration) => migration.version > currentVersion);

    if (pending.length > 0 && !options.isNewDatabase) {
      const databasePath = options.databasePath ?? resolveDefaultDatabasePath();
      const copyPath = copyDatabaseAside(database, databasePath);
      console.log('[electron] Database copied before migrating ->', path.basename(copyPath));
    }

    for (const migration of pending) {
      const sql = fs.readFileSync(migration.filePath, 'utf8').trim();
      const apply = database.transaction(() => {
        database.exec(sql);
        database.pragma(`user_version = ${migration.version}`);
      });

      try {
        apply();
      } catch (error) {
        throw new Error(`Migration ${migration.name} failed and was rolled back: ${error.message}`);
      }

      console.log('[electron] Applied migration ->', migration.name);
    }
  }

  ensureRequiredAppMeta(database);
}

module.exports = {
  LATEST_MIGRATION_VERSION,
  getMigrationFilePaths,
  runMigrations,
};
