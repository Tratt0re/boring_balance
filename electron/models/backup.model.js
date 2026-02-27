const fs = require('node:fs');
const path = require('node:path');
const { selectRows } = require('../database/core_op');
const {
  formatTimestampForFilename,
  listFilesSortedByMtime,
  safeReplaceFileWithBackup,
  safeWriteFileAtomic,
} = require('../utils/file-utils');

const BACKUP_FILE_PREFIX = 'boring-balance-backup-';
const SQLITE_FILE_SUFFIX = '.sqlite';
const SIDECAR_FILE_SUFFIX = '.json';
const APP_META_KEYS = Object.freeze(['db_uuid', 'change_counter', 'last_write_ms', 'schema_version']);

function normalizeIntegerOrNull(value) {
  const normalizedValue = Number(value);
  return Number.isInteger(normalizedValue) ? normalizedValue : null;
}

function assertDirectoryReadable(folderPath) {
  if (typeof folderPath !== 'string' || folderPath.trim().length === 0) {
    throw new Error('folderPath must be a non-empty string.');
  }

  const normalizedFolderPath = folderPath.trim();
  if (!fs.existsSync(normalizedFolderPath)) {
    throw new Error(`Backup folder does not exist: ${normalizedFolderPath}`);
  }

  const folderStats = fs.statSync(normalizedFolderPath);
  if (!folderStats.isDirectory()) {
    throw new Error(`Backup folder is not a directory: ${normalizedFolderPath}`);
  }

  fs.accessSync(normalizedFolderPath, fs.constants.R_OK);
  return normalizedFolderPath;
}

function assertDirectoryWritable(folderPath) {
  const normalizedFolderPath = assertDirectoryReadable(folderPath);
  fs.accessSync(normalizedFolderPath, fs.constants.W_OK);

  return normalizedFolderPath;
}

function readBackupSidecarMeta(sidecarPath) {
  if (!fs.existsSync(sidecarPath)) {
    return null;
  }

  try {
    const rawSidecarValue = fs.readFileSync(sidecarPath, 'utf8').trim();
    if (!rawSidecarValue) {
      return null;
    }

    const parsedSidecarValue = JSON.parse(rawSidecarValue);
    if (!parsedSidecarValue || typeof parsedSidecarValue !== 'object' || Array.isArray(parsedSidecarValue)) {
      return null;
    }

    return {
      created_at_ms: normalizeIntegerOrNull(parsedSidecarValue.created_at_ms),
      app_version:
        typeof parsedSidecarValue.app_version === 'string' && parsedSidecarValue.app_version.trim().length > 0
          ? parsedSidecarValue.app_version.trim()
          : null,
      schema_version: normalizeIntegerOrNull(parsedSidecarValue.schema_version),
      db_uuid:
        typeof parsedSidecarValue.db_uuid === 'string' && parsedSidecarValue.db_uuid.trim().length > 0
          ? parsedSidecarValue.db_uuid.trim()
          : null,
      change_counter: normalizeIntegerOrNull(parsedSidecarValue.change_counter),
      last_write_ms: normalizeIntegerOrNull(parsedSidecarValue.last_write_ms),
    };
  } catch {
    return null;
  }
}

function readBackupMeta(database) {
  if (!database || typeof database.prepare !== 'function') {
    throw new Error('database must be an initialized better-sqlite3 Database instance.');
  }

  try {
    const rows = selectRows(database, 'app_meta', { key: APP_META_KEYS });
    const valuesByKey = new Map(rows.map((row) => [String(row.key), row.value]));

    return {
      dbUuid:
        typeof valuesByKey.get('db_uuid') === 'string' && valuesByKey.get('db_uuid').trim().length > 0
          ? valuesByKey.get('db_uuid').trim()
          : null,
      changeCounter: normalizeIntegerOrNull(valuesByKey.get('change_counter')),
      lastWriteMs: normalizeIntegerOrNull(valuesByKey.get('last_write_ms')),
      schemaVersion: normalizeIntegerOrNull(valuesByKey.get('schema_version')),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('no such table: app_meta')) {
      return {
        dbUuid: null,
        changeCounter: null,
        lastWriteMs: null,
        schemaVersion: null,
      };
    }

    throw error;
  }
}

function resolveBackupFilePaths(folderPath) {
  let timestampMs = Date.now();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = formatTimestampForFilename(timestampMs);
    const baseName = `${BACKUP_FILE_PREFIX}${suffix}`;
    const sqliteFileName = `${baseName}${SQLITE_FILE_SUFFIX}`;
    const sidecarFileName = `${baseName}${SIDECAR_FILE_SUFFIX}`;
    const sqlitePath = path.join(folderPath, sqliteFileName);
    const sidecarPath = path.join(folderPath, sidecarFileName);

    if (!fs.existsSync(sqlitePath) && !fs.existsSync(sidecarPath)) {
      return {
        timestampMs,
        sqliteFileName,
        sidecarFileName,
        sqlitePath,
        sidecarPath,
      };
    }

    timestampMs += 1000;
  }

  throw new Error('Could not generate a unique backup filename.');
}

function listBackups(folderPath) {
  const normalizedFolderPath = assertDirectoryReadable(folderPath);
  const entries = listFilesSortedByMtime(normalizedFolderPath, {
    prefix: BACKUP_FILE_PREFIX,
    suffix: SQLITE_FILE_SUFFIX,
    descending: true,
  });

  return entries.map((entry) => {
    const sidecarFileName = `${entry.fileName.slice(0, -SQLITE_FILE_SUFFIX.length)}${SIDECAR_FILE_SUFFIX}`;
    const sidecarPath = path.join(normalizedFolderPath, sidecarFileName);
    const sidecarMeta = readBackupSidecarMeta(sidecarPath);

    return {
      fileName: entry.fileName,
      fullPath: entry.fullPath,
      createdAtMs: sidecarMeta?.created_at_ms ?? Math.round(entry.mtimeMs),
      sizeBytes: entry.sizeBytes,
      meta: sidecarMeta,
    };
  });
}

async function createBackup(database, folderPath, appVersion) {
  if (!database || typeof database.backup !== 'function') {
    throw new Error('database must be an initialized better-sqlite3 Database instance.');
  }

  const normalizedFolderPath = assertDirectoryWritable(folderPath);
  const resolvedAppVersion =
    typeof appVersion === 'string' && appVersion.trim().length > 0 ? appVersion.trim() : 'unknown';
  const backupMeta = readBackupMeta(database);
  const { timestampMs, sqliteFileName, sqlitePath, sidecarPath } = resolveBackupFilePaths(normalizedFolderPath);
  const sqliteTemporaryPath = `${sqlitePath}.tmp-${process.pid}-${Date.now()}`;
  const sidecarPayload = {
    created_at_ms: timestampMs,
    app_version: resolvedAppVersion,
    schema_version: backupMeta.schemaVersion ?? 0,
    db_uuid: backupMeta.dbUuid ?? '',
    change_counter: backupMeta.changeCounter ?? 0,
    last_write_ms: backupMeta.lastWriteMs ?? 0,
  };

  try {
    await database.backup(sqliteTemporaryPath);
    fs.renameSync(sqliteTemporaryPath, sqlitePath);
    safeWriteFileAtomic(sidecarPath, JSON.stringify(sidecarPayload, null, 2));
  } catch (error) {
    if (fs.existsSync(sqliteTemporaryPath)) {
      fs.unlinkSync(sqliteTemporaryPath);
    }

    if (fs.existsSync(sqlitePath) && !fs.existsSync(sidecarPath)) {
      fs.unlinkSync(sqlitePath);
    }

    throw error;
  }

  const sqliteStats = fs.statSync(sqlitePath);

  return {
    fileName: sqliteFileName,
    fullPath: sqlitePath,
    createdAtMs: timestampMs,
    sizeBytes: Number(sqliteStats.size),
    meta: sidecarPayload,
  };
}

function pruneBackups(folderPath, retentionCount) {
  const normalizedFolderPath = assertDirectoryWritable(folderPath);
  const normalizedRetentionCount = Number(retentionCount);

  if (!Number.isInteger(normalizedRetentionCount) || normalizedRetentionCount < 0) {
    throw new Error('retentionCount must be a non-negative integer.');
  }

  const backups = listBackups(normalizedFolderPath);
  if (backups.length <= normalizedRetentionCount) {
    return {
      removed: [],
      kept: backups.length,
    };
  }

  const removedBackups = [];
  for (const backup of backups.slice(normalizedRetentionCount)) {
    if (fs.existsSync(backup.fullPath)) {
      fs.unlinkSync(backup.fullPath);
    }

    const sidecarPath = `${backup.fullPath.slice(0, -SQLITE_FILE_SUFFIX.length)}${SIDECAR_FILE_SUFFIX}`;
    if (fs.existsSync(sidecarPath)) {
      fs.unlinkSync(sidecarPath);
    }

    removedBackups.push({
      fileName: backup.fileName,
      fullPath: backup.fullPath,
    });
  }

  return {
    removed: removedBackups,
    kept: backups.length - removedBackups.length,
  };
}

function restoreBackup(backupFilePath, localDbPath) {
  if (typeof backupFilePath !== 'string' || backupFilePath.trim().length === 0) {
    throw new Error('backupFilePath must be a non-empty string.');
  }

  if (typeof localDbPath !== 'string' || localDbPath.trim().length === 0) {
    throw new Error('localDbPath must be a non-empty string.');
  }

  const normalizedBackupFilePath = backupFilePath.trim();
  const normalizedLocalDbPath = localDbPath.trim();
  if (!fs.existsSync(normalizedBackupFilePath)) {
    throw new Error(`Backup file does not exist: ${normalizedBackupFilePath}`);
  }

  const backupFileStats = fs.statSync(normalizedBackupFilePath);
  if (!backupFileStats.isFile()) {
    throw new Error(`Backup file is not a regular file: ${normalizedBackupFilePath}`);
  }

  const previousLocalCopyPath = safeReplaceFileWithBackup(
    normalizedLocalDbPath,
    normalizedBackupFilePath,
    formatTimestampForFilename(),
  );

  return {
    restoredFrom: normalizedBackupFilePath,
    restoredTo: normalizedLocalDbPath,
    previousLocalCopyPath,
  };
}

module.exports = {
  BACKUP_FILE_PREFIX,
  SQLITE_FILE_SUFFIX,
  createBackup,
  listBackups,
  pruneBackups,
  readBackupMeta,
  restoreBackup,
};
