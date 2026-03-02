const fs = require('node:fs');
const path = require('node:path');
const { selectRows } = require('../database/core_op');
const { formatTimestampForFilename, safeReplaceFileWithBackup } = require('../utils/file-utils');

const SYNC_SCHEMA_VERSION = 1;
const SYNC_CONTAINER_DIR_NAME = 'boring-balance.sync';
const INDEX_FILE_NAME = 'sync_index.json';
const SNAPSHOTS_DIR_NAME = 'snapshots';
const SNAPSHOT_FILE_PREFIX = 'snap_';
const SQLITE_FILE_SUFFIX = '.sqlite';
const APP_META_KEYS = Object.freeze(['db_uuid', 'change_counter', 'last_write_ms', 'schema_version']);
const SNAPSHOT_FILE_PATTERN = /^snap_(.+)_(\d+)_(\d+)_(.+)\.sqlite$/;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ensureNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeIntegerOrNull(value) {
  const normalizedValue = Number(value);
  return Number.isInteger(normalizedValue) ? normalizedValue : null;
}

function normalizeNonEmptyStringOrNull(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function assertExistingDirectory(directoryPath, label) {
  const normalizedDirectoryPath = path.resolve(ensureNonEmptyString(directoryPath, label));
  if (!fs.existsSync(normalizedDirectoryPath)) {
    throw new Error(`${label} does not exist: ${normalizedDirectoryPath}`);
  }

  const stats = fs.statSync(normalizedDirectoryPath);
  if (!stats.isDirectory()) {
    throw new Error(`${label} is not a directory: ${normalizedDirectoryPath}`);
  }

  return normalizedDirectoryPath;
}

function assertReadableDirectory(directoryPath, label) {
  const normalizedDirectoryPath = assertExistingDirectory(directoryPath, label);
  fs.accessSync(normalizedDirectoryPath, fs.constants.R_OK);

  return normalizedDirectoryPath;
}

function assertWritableDirectory(directoryPath, label) {
  const normalizedDirectoryPath = assertReadableDirectory(directoryPath, label);
  fs.accessSync(normalizedDirectoryPath, fs.constants.W_OK);

  return normalizedDirectoryPath;
}

function getSyncPaths(folderPath) {
  const normalizedFolderPath = assertReadableDirectory(folderPath, 'folderPath');
  const syncRootPath = path.join(normalizedFolderPath, SYNC_CONTAINER_DIR_NAME);
  const snapshotsDir = path.join(syncRootPath, SNAPSHOTS_DIR_NAME);
  const indexPath = path.join(syncRootPath, INDEX_FILE_NAME);

  return {
    folderPath: normalizedFolderPath,
    syncRootPath,
    snapshotsDir,
    indexPath,
  };
}

function ensureSyncDirs(folderPath) {
  const syncPaths = getSyncPaths(assertWritableDirectory(folderPath, 'folderPath'));
  fs.mkdirSync(syncPaths.syncRootPath, { recursive: true });
  fs.mkdirSync(syncPaths.snapshotsDir, { recursive: true });

  return syncPaths;
}

function writeWithFixedTempPath(filePath, content) {
  const normalizedFilePath = path.resolve(ensureNonEmptyString(filePath, 'filePath'));
  if (!Buffer.isBuffer(content) && typeof content !== 'string') {
    throw new Error('content must be a string or Buffer.');
  }

  const directoryPath = path.dirname(normalizedFilePath);
  fs.mkdirSync(directoryPath, { recursive: true });

  const temporaryPath = `${normalizedFilePath}.tmp`;
  if (fs.existsSync(temporaryPath)) {
    fs.unlinkSync(temporaryPath);
  }

  try {
    fs.writeFileSync(temporaryPath, content);
    fs.renameSync(temporaryPath, normalizedFilePath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }

    throw error;
  }

  return normalizedFilePath;
}

function normalizeIndexLatest(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  const file = normalizeNonEmptyStringOrNull(value.file);
  const dbUuid = normalizeNonEmptyStringOrNull(value.db_uuid);
  const deviceId = normalizeNonEmptyStringOrNull(value.device_id);
  const changeCounter = normalizeIntegerOrNull(value.change_counter);
  const lastWriteMs = normalizeIntegerOrNull(value.last_write_ms);
  const createdAtMs = normalizeIntegerOrNull(value.created_at_ms);

  if (!file || !dbUuid || !deviceId || !Number.isInteger(changeCounter) || !Number.isInteger(lastWriteMs) || !Number.isInteger(createdAtMs)) {
    return null;
  }

  return {
    file,
    db_uuid: dbUuid,
    change_counter: changeCounter,
    last_write_ms: lastWriteMs,
    created_at_ms: createdAtMs,
    device_id: deviceId,
  };
}

function readIndex(indexPath) {
  const normalizedIndexPath = path.resolve(ensureNonEmptyString(indexPath, 'indexPath'));
  if (!fs.existsSync(normalizedIndexPath)) {
    return null;
  }

  try {
    const rawValue = fs.readFileSync(normalizedIndexPath, 'utf8').trim();
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);
    if (!isPlainObject(parsedValue)) {
      return null;
    }

    const schemaVersion = normalizeIntegerOrNull(parsedValue.schema_version);
    const updatedAtMs = normalizeIntegerOrNull(parsedValue.updated_at_ms);
    const latest = normalizeIndexLatest(parsedValue.latest);

    if (schemaVersion !== SYNC_SCHEMA_VERSION || !Number.isInteger(updatedAtMs) || !latest) {
      return null;
    }

    return {
      schema_version: schemaVersion,
      updated_at_ms: updatedAtMs,
      latest,
    };
  } catch {
    return null;
  }
}

function writeIndexAtomic(indexPath, indexObj) {
  const normalizedIndexPath = path.resolve(ensureNonEmptyString(indexPath, 'indexPath'));
  if (!isPlainObject(indexObj)) {
    throw new Error('indexObj must be a plain object.');
  }

  const latest = normalizeIndexLatest(indexObj.latest);
  const updatedAtMs = normalizeIntegerOrNull(indexObj.updated_at_ms);
  const schemaVersion = normalizeIntegerOrNull(indexObj.schema_version);

  if (schemaVersion !== SYNC_SCHEMA_VERSION) {
    throw new Error(`indexObj.schema_version must be ${SYNC_SCHEMA_VERSION}.`);
  }

  if (!Number.isInteger(updatedAtMs)) {
    throw new Error('indexObj.updated_at_ms must be an integer.');
  }

  if (!latest) {
    throw new Error('indexObj.latest is invalid.');
  }

  return writeWithFixedTempPath(
    normalizedIndexPath,
    JSON.stringify(
      {
        schema_version: schemaVersion,
        updated_at_ms: updatedAtMs,
        latest,
      },
      null,
      2,
    ),
  );
}

function getComparableRank(meta) {
  return {
    changeCounter: normalizeIntegerOrNull(meta?.change_counter) ?? -1,
    lastWriteMs: normalizeIntegerOrNull(meta?.last_write_ms) ?? -1,
  };
}

function compareByCounterThenLastWrite(left, right) {
  const leftRank = getComparableRank(left);
  const rightRank = getComparableRank(right);
  const counterDiff = leftRank.changeCounter - rightRank.changeCounter;
  if (counterDiff !== 0) {
    return counterDiff;
  }

  return leftRank.lastWriteMs - rightRank.lastWriteMs;
}

function isRemoteNewer(remoteLatest, localMeta) {
  return compareByCounterThenLastWrite(remoteLatest, localMeta) > 0;
}

function isLocalNewerThanIndex(localMeta, indexLatest) {
  if (!indexLatest) {
    return true;
  }

  return compareByCounterThenLastWrite(localMeta, indexLatest) > 0;
}

function createSnapshotFileName(meta, deviceId, timestampMs) {
  const dbUuid = ensureNonEmptyString(meta?.db_uuid, 'meta.db_uuid');
  const changeCounter = normalizeIntegerOrNull(meta?.change_counter);
  const normalizedDeviceId = ensureNonEmptyString(deviceId, 'deviceId');

  if (!Number.isInteger(changeCounter) || changeCounter < 0) {
    throw new Error('meta.change_counter must be a non-negative integer.');
  }

  return `${SNAPSHOT_FILE_PREFIX}${dbUuid}_${changeCounter}_${timestampMs}_${normalizedDeviceId}${SQLITE_FILE_SUFFIX}`;
}

async function createSnapshot(database, snapshotsDir, deviceId, meta) {
  if (!database || typeof database.backup !== 'function') {
    throw new Error('database must be an initialized better-sqlite3 Database instance.');
  }

  const normalizedSnapshotsDir = assertWritableDirectory(snapshotsDir, 'snapshotsDir');
  const lastWriteMs = normalizeIntegerOrNull(meta?.last_write_ms);
  const schemaVersion = normalizeIntegerOrNull(meta?.schema_version);

  if (!Number.isInteger(lastWriteMs) || lastWriteMs < 0) {
    throw new Error('meta.last_write_ms must be a non-negative integer.');
  }

  if (!Number.isInteger(schemaVersion) || schemaVersion < 0) {
    throw new Error('meta.schema_version must be a non-negative integer.');
  }

  let createdAtMs = Date.now();
  let snapshotFileName = createSnapshotFileName(meta, deviceId, createdAtMs);
  let snapshotFilePath = path.join(normalizedSnapshotsDir, snapshotFileName);

  for (let attempt = 0; attempt < 5 && fs.existsSync(snapshotFilePath); attempt += 1) {
    createdAtMs += 1;
    snapshotFileName = createSnapshotFileName(meta, deviceId, createdAtMs);
    snapshotFilePath = path.join(normalizedSnapshotsDir, snapshotFileName);
  }

  if (fs.existsSync(snapshotFilePath)) {
    throw new Error('Could not generate a unique snapshot filename.');
  }

  const temporaryPath = `${snapshotFilePath}.tmp`;
  if (fs.existsSync(temporaryPath)) {
    fs.unlinkSync(temporaryPath);
  }

  try {
    await database.backup(temporaryPath);
    fs.renameSync(temporaryPath, snapshotFilePath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }

    throw error;
  }

  const snapshotStats = fs.statSync(snapshotFilePath);

  return {
    file: snapshotFileName,
    filePath: snapshotFilePath,
    created_at_ms: createdAtMs,
    size_bytes: Number(snapshotStats.size),
    meta: {
      db_uuid: meta.db_uuid,
      change_counter: meta.change_counter,
      last_write_ms: meta.last_write_ms,
      schema_version: meta.schema_version,
      device_id: ensureNonEmptyString(deviceId, 'deviceId'),
    },
  };
}

function restoreSnapshotToLocal(snapshotPath, localDbPath) {
  const normalizedSnapshotPath = path.resolve(ensureNonEmptyString(snapshotPath, 'snapshotPath'));
  const normalizedLocalDbPath = path.resolve(ensureNonEmptyString(localDbPath, 'localDbPath'));

  if (!normalizedSnapshotPath.endsWith(SQLITE_FILE_SUFFIX)) {
    throw new Error(`Snapshot file must end with "${SQLITE_FILE_SUFFIX}".`);
  }

  if (!fs.existsSync(normalizedSnapshotPath)) {
    throw new Error(`Snapshot file does not exist: ${normalizedSnapshotPath}`);
  }

  const snapshotStats = fs.statSync(normalizedSnapshotPath);
  if (!snapshotStats.isFile()) {
    throw new Error(`Snapshot file is not a regular file: ${normalizedSnapshotPath}`);
  }

  const previousLocalCopyPath = safeReplaceFileWithBackup(
    normalizedLocalDbPath,
    normalizedSnapshotPath,
    formatTimestampForFilename(),
  );

  return {
    restoredFrom: normalizedSnapshotPath,
    restoredTo: normalizedLocalDbPath,
    previousLocalCopyPath,
  };
}

function getLocalDbMeta(database) {
  if (!database || typeof database.prepare !== 'function') {
    throw new Error('database must be an initialized better-sqlite3 Database instance.');
  }

  try {
    const rows = selectRows(database, 'app_meta', { key: APP_META_KEYS });
    const valuesByKey = new Map(rows.map((row) => [String(row.key), row.value]));

    return {
      db_uuid: normalizeNonEmptyStringOrNull(valuesByKey.get('db_uuid')),
      change_counter: normalizeIntegerOrNull(valuesByKey.get('change_counter')),
      last_write_ms: normalizeIntegerOrNull(valuesByKey.get('last_write_ms')),
      schema_version: normalizeIntegerOrNull(valuesByKey.get('schema_version')),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('no such table: app_meta')) {
      return {
        db_uuid: null,
        change_counter: null,
        last_write_ms: null,
        schema_version: null,
      };
    }

    throw error;
  }
}

function listSnapshots(folderPath) {
  const { snapshotsDir } = getSyncPaths(folderPath);
  if (!fs.existsSync(snapshotsDir)) {
    return [];
  }

  const entries = fs.readdirSync(snapshotsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(SQLITE_FILE_SUFFIX))
    .map((entry) => {
      const fullPath = path.join(snapshotsDir, entry.name);
      const stats = fs.statSync(fullPath);
      const match = entry.name.match(SNAPSHOT_FILE_PATTERN);
      const createdAtMs = match ? normalizeIntegerOrNull(match[3]) : null;
      const changeCounter = match ? normalizeIntegerOrNull(match[2]) : null;
      const deviceId = match ? normalizeNonEmptyStringOrNull(match[4]) : null;
      const dbUuid = match ? normalizeNonEmptyStringOrNull(match[1]) : null;

      return {
        snapshotId: entry.name.slice(0, -SQLITE_FILE_SUFFIX.length),
        fileName: entry.name,
        snapshotFilePath: fullPath,
        fullPath,
        sidecarPath: '',
        sidecarFileName: '',
        createdAtMs: createdAtMs ?? Math.round(stats.mtimeMs),
        sizeBytes: Number(stats.size),
        repoId: 'snapshot-index',
        deviceId: deviceId ?? '',
        meta: {
          db_uuid: dbUuid,
          change_counter: changeCounter,
          last_write_ms: null,
          schema_version: null,
        },
      };
    });

  entries.sort((left, right) => {
    const createdDiff = right.createdAtMs - left.createdAtMs;
    if (createdDiff !== 0) {
      return createdDiff;
    }

    return right.fileName.localeCompare(left.fileName);
  });

  return entries;
}

module.exports = {
  INDEX_FILE_NAME,
  SNAPSHOTS_DIR_NAME,
  SQLITE_FILE_SUFFIX,
  SYNC_CONTAINER_DIR_NAME,
  SYNC_SCHEMA_VERSION,
  createSnapshot,
  ensureSyncDirs,
  getLocalDbMeta,
  getSyncPaths,
  isLocalNewerThanIndex,
  isRemoteNewer,
  listSnapshots,
  readIndex,
  restoreSnapshotToLocal,
  writeIndexAtomic,
};
