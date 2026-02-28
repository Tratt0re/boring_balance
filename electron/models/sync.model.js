const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { selectRows } = require('../database/core_op');
const {
  formatTimestampForFilename,
  listFilesSortedByMtime,
  safeReplaceFileWithBackup,
  safeWriteFileAtomic,
} = require('../utils/file-utils');

const SYNC_APP_NAME = 'Boring Balance';
const SYNC_SCHEMA_VERSION = 1;
const DEFAULT_REPO_FOLDER_NAME = 'BoringBalance.sync';
const REPO_FILE_NAME = 'repo.json';
const DEVICES_DIR_NAME = 'devices';
const DEVICE_FILE_NAME = 'device.json';
const SNAPSHOTS_DIR_NAME = 'snapshots';
const SNAPSHOT_FILE_PREFIX = 'snap_';
const SQLITE_FILE_SUFFIX = '.sqlite';
const SIDECAR_FILE_SUFFIX = '.json';
const APP_META_KEYS = Object.freeze(['db_uuid', 'change_counter', 'last_write_ms', 'schema_version']);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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

function ensureNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function assertDirectoryReadable(directoryPath, label) {
  const normalizedDirectoryPath = ensureNonEmptyString(directoryPath, label);
  if (!fs.existsSync(normalizedDirectoryPath)) {
    throw new Error(`${label} does not exist: ${normalizedDirectoryPath}`);
  }

  const stats = fs.statSync(normalizedDirectoryPath);
  if (!stats.isDirectory()) {
    throw new Error(`${label} is not a directory: ${normalizedDirectoryPath}`);
  }

  fs.accessSync(normalizedDirectoryPath, fs.constants.R_OK);
  return normalizedDirectoryPath;
}

function assertDirectoryWritable(directoryPath, label) {
  const normalizedDirectoryPath = assertDirectoryReadable(directoryPath, label);
  fs.accessSync(normalizedDirectoryPath, fs.constants.W_OK);

  return normalizedDirectoryPath;
}

function readJsonObject(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const rawValue = fs.readFileSync(filePath, 'utf8').trim();
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);
    return isPlainObject(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
}

function writeFileWithFinalTempPath(filePath, content) {
  const normalizedFilePath = ensureNonEmptyString(filePath, 'filePath');
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

function resolveRepoFilePath(repoPath) {
  return path.join(repoPath, REPO_FILE_NAME);
}

function resolveDevicesRootPath(repoPath) {
  return path.join(repoPath, DEVICES_DIR_NAME);
}

function resolveDeviceDirectoryPath(repoPath, deviceId) {
  return path.join(resolveDevicesRootPath(repoPath), ensureNonEmptyString(deviceId, 'deviceId'));
}

function resolveDeviceFilePath(repoPath, deviceId) {
  return path.join(resolveDeviceDirectoryPath(repoPath, deviceId), DEVICE_FILE_NAME);
}

function resolveDeviceSnapshotsPath(repoPath, deviceId) {
  return path.join(resolveDeviceDirectoryPath(repoPath, deviceId), SNAPSHOTS_DIR_NAME);
}

function readRepoMeta(repoPath) {
  const normalizedRepoPath = assertDirectoryReadable(repoPath, 'repoPath');
  const repoFilePath = resolveRepoFilePath(normalizedRepoPath);
  const repoValue = readJsonObject(repoFilePath);

  if (!repoValue) {
    throw new Error(`Invalid sync repository metadata: ${repoFilePath}`);
  }

  const repoId = normalizeNonEmptyStringOrNull(repoValue.repo_id);
  const createdAtMs = normalizeIntegerOrNull(repoValue.created_at_ms);
  const syncSchemaVersion = normalizeIntegerOrNull(repoValue.sync_schema_version);
  const appName = normalizeNonEmptyStringOrNull(repoValue.app_name);

  if (!repoId) {
    throw new Error(`Invalid sync repository id in ${repoFilePath}`);
  }

  if (!Number.isInteger(createdAtMs)) {
    throw new Error(`Invalid sync repository created_at_ms in ${repoFilePath}`);
  }

  if (syncSchemaVersion !== SYNC_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported sync repository schema version: ${repoValue.sync_schema_version}. Expected ${SYNC_SCHEMA_VERSION}.`,
    );
  }

  if (!appName) {
    throw new Error(`Invalid sync repository app_name in ${repoFilePath}`);
  }

  return {
    repoId,
    createdAtMs,
    syncSchemaVersion,
    appName,
    repoPath: normalizedRepoPath,
    repoFilePath,
  };
}

function ensureDeviceRegistration(repoPath, deviceId, deviceName = null) {
  const normalizedRepoPath = assertDirectoryWritable(repoPath, 'repoPath');
  const normalizedDeviceId = ensureNonEmptyString(deviceId, 'deviceId');
  const normalizedDeviceName = normalizeNonEmptyStringOrNull(deviceName);
  const deviceDirectoryPath = resolveDeviceDirectoryPath(normalizedRepoPath, normalizedDeviceId);
  const snapshotsDirectoryPath = resolveDeviceSnapshotsPath(normalizedRepoPath, normalizedDeviceId);
  const deviceFilePath = resolveDeviceFilePath(normalizedRepoPath, normalizedDeviceId);
  const existingValue = readJsonObject(deviceFilePath);
  const createdAtMs = normalizeIntegerOrNull(existingValue?.created_at_ms) ?? Date.now();
  const nextPayload = {
    device_id: normalizedDeviceId,
    device_name: normalizedDeviceName,
    created_at_ms: createdAtMs,
  };

  fs.mkdirSync(snapshotsDirectoryPath, { recursive: true });

  const existingPayload = existingValue && isPlainObject(existingValue) ? JSON.stringify(existingValue) : null;
  const nextPayloadValue = JSON.stringify(nextPayload);
  if (existingPayload !== nextPayloadValue) {
    safeWriteFileAtomic(deviceFilePath, JSON.stringify(nextPayload, null, 2));
  }

  return {
    deviceId: normalizedDeviceId,
    deviceName: normalizedDeviceName,
    createdAtMs,
    deviceFilePath,
    deviceDirectoryPath,
    snapshotsDirectoryPath,
  };
}

function normalizeSnapshotSidecar(sidecarValue) {
  if (!isPlainObject(sidecarValue)) {
    return null;
  }

  const repoId = normalizeNonEmptyStringOrNull(sidecarValue.repo_id);
  const deviceId = normalizeNonEmptyStringOrNull(sidecarValue.device_id);
  const snapshotCreatedMs = normalizeIntegerOrNull(sidecarValue.snapshot_created_ms);

  if (!repoId || !deviceId || !Number.isInteger(snapshotCreatedMs)) {
    return null;
  }

  return {
    repo_id: repoId,
    device_id: deviceId,
    snapshot_created_ms: snapshotCreatedMs,
    db_uuid: normalizeNonEmptyStringOrNull(sidecarValue.db_uuid),
    change_counter: normalizeIntegerOrNull(sidecarValue.change_counter),
    last_write_ms: normalizeIntegerOrNull(sidecarValue.last_write_ms),
    schema_version: normalizeIntegerOrNull(sidecarValue.schema_version),
    app_version: normalizeNonEmptyStringOrNull(sidecarValue.app_version),
    checksum_sha256: normalizeNonEmptyStringOrNull(sidecarValue.checksum_sha256),
  };
}

function compareSnapshotsByRecency(left, right) {
  const timestampDiff =
    (right.meta?.snapshot_created_ms ?? right.createdAtMs ?? 0) - (left.meta?.snapshot_created_ms ?? left.createdAtMs ?? 0);
  if (timestampDiff !== 0) {
    return timestampDiff;
  }

  const lastWriteDiff = (right.meta?.last_write_ms ?? 0) - (left.meta?.last_write_ms ?? 0);
  if (lastWriteDiff !== 0) {
    return lastWriteDiff;
  }

  const counterDiff = (right.meta?.change_counter ?? 0) - (left.meta?.change_counter ?? 0);
  if (counterDiff !== 0) {
    return counterDiff;
  }

  return right.snapshotId.localeCompare(left.snapshotId);
}

function compareSnapshotsByLineage(left, right) {
  const counterDiff = (right.meta?.change_counter ?? 0) - (left.meta?.change_counter ?? 0);
  if (counterDiff !== 0) {
    return counterDiff;
  }

  const lastWriteDiff = (right.meta?.last_write_ms ?? 0) - (left.meta?.last_write_ms ?? 0);
  if (lastWriteDiff !== 0) {
    return lastWriteDiff;
  }

  return compareSnapshotsByRecency(left, right);
}

function resolveSnapshotFilePaths(repoPath, repoId, deviceId, changeCounter) {
  const normalizedRepoId = ensureNonEmptyString(repoId, 'repoId');
  const normalizedRepoPath = assertDirectoryWritable(repoPath, 'repoPath');
  const normalizedDeviceId = ensureNonEmptyString(deviceId, 'deviceId');
  const snapshotsDirectoryPath = resolveDeviceSnapshotsPath(normalizedRepoPath, normalizedDeviceId);
  fs.mkdirSync(snapshotsDirectoryPath, { recursive: true });
  const normalizedChangeCounter = Number.isInteger(changeCounter) ? changeCounter : 0;
  let timestampMs = Date.now();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const timestampToken = formatTimestampForFilename(timestampMs);
    const snapshotId = `${SNAPSHOT_FILE_PREFIX}${normalizedRepoId}_${normalizedChangeCounter}_${timestampToken}`;
    const snapshotFileName = `${snapshotId}${SQLITE_FILE_SUFFIX}`;
    const sidecarFileName = `${snapshotId}${SIDECAR_FILE_SUFFIX}`;
    const snapshotFilePath = path.join(snapshotsDirectoryPath, snapshotFileName);
    const sidecarFilePath = path.join(snapshotsDirectoryPath, sidecarFileName);

    if (!fs.existsSync(snapshotFilePath) && !fs.existsSync(sidecarFilePath)) {
      return {
        snapshotId,
        snapshotFileName,
        sidecarFileName,
        snapshotFilePath,
        sidecarFilePath,
        timestampMs,
      };
    }

    timestampMs += 1000;
  }

  throw new Error('Could not generate a unique sync snapshot filename.');
}

function repoExists(repoPath) {
  if (typeof repoPath !== 'string' || repoPath.trim().length === 0) {
    return false;
  }

  const normalizedRepoPath = repoPath.trim();
  if (!fs.existsSync(normalizedRepoPath)) {
    return false;
  }

  const stats = fs.statSync(normalizedRepoPath);
  if (!stats.isDirectory()) {
    return false;
  }

  const repoFilePath = resolveRepoFilePath(normalizedRepoPath);
  if (!fs.existsSync(repoFilePath)) {
    return false;
  }

  return fs.statSync(repoFilePath).isFile();
}

function initRepo(repoPath, deviceId, deviceName = null) {
  const normalizedRepoPath = ensureNonEmptyString(repoPath, 'repoPath');
  if (repoExists(normalizedRepoPath)) {
    throw new Error(`Sync repository already exists: ${normalizedRepoPath}`);
  }

  fs.mkdirSync(normalizedRepoPath, { recursive: true });

  const repoPayload = {
    repo_id: randomUUID(),
    created_at_ms: Date.now(),
    sync_schema_version: SYNC_SCHEMA_VERSION,
    app_name: SYNC_APP_NAME,
  };

  safeWriteFileAtomic(resolveRepoFilePath(normalizedRepoPath), JSON.stringify(repoPayload, null, 2));
  ensureDeviceRegistration(normalizedRepoPath, deviceId, deviceName);

  return readRepoMeta(normalizedRepoPath);
}

function attachRepo(repoPath) {
  return readRepoMeta(repoPath);
}

function listAllSnapshots(repoPath) {
  const repoMeta = attachRepo(repoPath);
  const devicesRootPath = resolveDevicesRootPath(repoMeta.repoPath);

  if (!fs.existsSync(devicesRootPath)) {
    return [];
  }

  const deviceEntries = fs.readdirSync(devicesRootPath, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const snapshots = [];

  for (const deviceEntry of deviceEntries) {
    const deviceId = deviceEntry.name;
    const snapshotsDirectoryPath = resolveDeviceSnapshotsPath(repoMeta.repoPath, deviceId);
    if (!fs.existsSync(snapshotsDirectoryPath)) {
      continue;
    }

    const sidecarEntries = listFilesSortedByMtime(snapshotsDirectoryPath, {
      prefix: SNAPSHOT_FILE_PREFIX,
      suffix: SIDECAR_FILE_SUFFIX,
      descending: true,
    });

    for (const sidecarEntry of sidecarEntries) {
      const snapshotId = sidecarEntry.fileName.slice(0, -SIDECAR_FILE_SUFFIX.length);
      const snapshotFileName = `${snapshotId}${SQLITE_FILE_SUFFIX}`;
      const snapshotFilePath = path.join(snapshotsDirectoryPath, snapshotFileName);
      if (!fs.existsSync(snapshotFilePath)) {
        continue;
      }

      const snapshotStats = fs.statSync(snapshotFilePath);
      if (!snapshotStats.isFile()) {
        continue;
      }

      const sidecarValue = readJsonObject(sidecarEntry.fullPath);
      const sidecarMeta = normalizeSnapshotSidecar(sidecarValue);
      if (!sidecarMeta || sidecarMeta.repo_id !== repoMeta.repoId) {
        continue;
      }

      snapshots.push({
        snapshotId,
        fileName: snapshotFileName,
        snapshotFilePath,
        fullPath: snapshotFilePath,
        sidecarPath: sidecarEntry.fullPath,
        sidecarFileName: sidecarEntry.fileName,
        createdAtMs: sidecarMeta.snapshot_created_ms,
        sizeBytes: Number(snapshotStats.size),
        repoId: sidecarMeta.repo_id,
        deviceId: sidecarMeta.device_id,
        meta: sidecarMeta,
      });
    }
  }

  snapshots.sort(compareSnapshotsByRecency);
  return snapshots;
}

function pickBestSnapshot(snapshots, localDbUuid) {
  const normalizedSnapshots = Array.isArray(snapshots) ? snapshots.filter(Boolean) : [];
  if (normalizedSnapshots.length === 0) {
    return {
      snapshot: null,
      reason: 'no-snapshots',
    };
  }

  const normalizedLocalDbUuid = normalizeNonEmptyStringOrNull(localDbUuid);
  const sameLineageSnapshots = normalizedSnapshots
    .filter((snapshot) => normalizeNonEmptyStringOrNull(snapshot?.meta?.db_uuid) === normalizedLocalDbUuid)
    .slice()
    .sort(compareSnapshotsByLineage);

  if (sameLineageSnapshots.length > 0) {
    return {
      snapshot: sameLineageSnapshots[0],
      reason: 'same-lineage',
    };
  }

  const byRecency = normalizedSnapshots.slice().sort(compareSnapshotsByRecency);
  return {
    snapshot: byRecency[0],
    reason: normalizedLocalDbUuid === null ? 'latest-available' : 'remote-lineage-mismatch',
  };
}

function readDbMeta(database) {
  if (!database || typeof database.prepare !== 'function') {
    throw new Error('database must be an initialized better-sqlite3 Database instance.');
  }

  try {
    const rows = selectRows(database, 'app_meta', { key: APP_META_KEYS });
    const valuesByKey = new Map(rows.map((row) => [String(row.key), row.value]));

    return {
      dbUuid: normalizeNonEmptyStringOrNull(valuesByKey.get('db_uuid')),
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

async function createSnapshot(database, repoPath, deviceId, appVersion, deviceName = null) {
  if (!database || typeof database.backup !== 'function') {
    throw new Error('database must be an initialized better-sqlite3 Database instance.');
  }

  const repoMeta = attachRepo(repoPath);
  const deviceMeta = ensureDeviceRegistration(repoMeta.repoPath, deviceId, deviceName);
  const dbMeta = readDbMeta(database);
  const resolvedAppVersion = normalizeNonEmptyStringOrNull(appVersion) ?? 'unknown';
  const snapshotPaths = resolveSnapshotFilePaths(repoMeta.repoPath, repoMeta.repoId, deviceMeta.deviceId, dbMeta.changeCounter);
  const sidecarPayload = {
    repo_id: repoMeta.repoId,
    device_id: deviceMeta.deviceId,
    snapshot_created_ms: snapshotPaths.timestampMs,
    db_uuid: dbMeta.dbUuid,
    change_counter: dbMeta.changeCounter ?? 0,
    last_write_ms: dbMeta.lastWriteMs ?? 0,
    schema_version: dbMeta.schemaVersion ?? 0,
    app_version: resolvedAppVersion,
  };
  const snapshotTemporaryPath = `${snapshotPaths.snapshotFilePath}.tmp`;

  if (fs.existsSync(snapshotTemporaryPath)) {
    fs.unlinkSync(snapshotTemporaryPath);
  }

  try {
    await database.backup(snapshotTemporaryPath);
    fs.renameSync(snapshotTemporaryPath, snapshotPaths.snapshotFilePath);
    writeFileWithFinalTempPath(snapshotPaths.sidecarFilePath, JSON.stringify(sidecarPayload, null, 2));
  } catch (error) {
    if (fs.existsSync(snapshotTemporaryPath)) {
      fs.unlinkSync(snapshotTemporaryPath);
    }

    if (fs.existsSync(snapshotPaths.snapshotFilePath) && !fs.existsSync(snapshotPaths.sidecarFilePath)) {
      fs.unlinkSync(snapshotPaths.snapshotFilePath);
    }

    throw error;
  }

  const snapshotStats = fs.statSync(snapshotPaths.snapshotFilePath);

  return {
    snapshotId: snapshotPaths.snapshotId,
    fileName: snapshotPaths.snapshotFileName,
    snapshotFilePath: snapshotPaths.snapshotFilePath,
    fullPath: snapshotPaths.snapshotFilePath,
    sidecarPath: snapshotPaths.sidecarFilePath,
    sidecarFileName: snapshotPaths.sidecarFileName,
    createdAtMs: snapshotPaths.timestampMs,
    sizeBytes: Number(snapshotStats.size),
    repoId: repoMeta.repoId,
    deviceId: deviceMeta.deviceId,
    meta: sidecarPayload,
  };
}

function pruneSnapshots(repoPath, deviceId, retentionCountPerDevice) {
  const repoMeta = attachRepo(repoPath);
  const normalizedRetentionCount = Number(retentionCountPerDevice);
  if (!Number.isInteger(normalizedRetentionCount) || normalizedRetentionCount < 0) {
    throw new Error('retentionCountPerDevice must be a non-negative integer.');
  }

  const normalizedDeviceId = ensureNonEmptyString(deviceId, 'deviceId');
  const snapshots = listAllSnapshots(repoMeta.repoPath).filter((snapshot) => snapshot.deviceId === normalizedDeviceId);
  if (snapshots.length <= normalizedRetentionCount) {
    return {
      removed: [],
      kept: snapshots.length,
    };
  }

  const removedSnapshots = [];
  for (const snapshot of snapshots.slice(normalizedRetentionCount)) {
    if (fs.existsSync(snapshot.snapshotFilePath)) {
      fs.unlinkSync(snapshot.snapshotFilePath);
    }

    if (fs.existsSync(snapshot.sidecarPath)) {
      fs.unlinkSync(snapshot.sidecarPath);
    }

    removedSnapshots.push({
      snapshotId: snapshot.snapshotId,
      snapshotFilePath: snapshot.snapshotFilePath,
      sidecarPath: snapshot.sidecarPath,
    });
  }

  return {
    removed: removedSnapshots,
    kept: snapshots.length - removedSnapshots.length,
  };
}

function restoreSnapshotToLocal(snapshotFilePath, localDbPath) {
  const normalizedSnapshotFilePath = ensureNonEmptyString(snapshotFilePath, 'snapshotFilePath');
  const normalizedLocalDbPath = ensureNonEmptyString(localDbPath, 'localDbPath');

  if (!normalizedSnapshotFilePath.endsWith(SQLITE_FILE_SUFFIX)) {
    throw new Error(`Snapshot file must end with "${SQLITE_FILE_SUFFIX}".`);
  }

  if (!fs.existsSync(normalizedSnapshotFilePath)) {
    throw new Error(`Snapshot file does not exist: ${normalizedSnapshotFilePath}`);
  }

  const snapshotStats = fs.statSync(normalizedSnapshotFilePath);
  if (!snapshotStats.isFile()) {
    throw new Error(`Snapshot file is not a regular file: ${normalizedSnapshotFilePath}`);
  }

  const previousLocalCopyPath = safeReplaceFileWithBackup(
    normalizedLocalDbPath,
    normalizedSnapshotFilePath,
    formatTimestampForFilename(),
  );

  return {
    restoredFrom: normalizedSnapshotFilePath,
    restoredTo: normalizedLocalDbPath,
    previousLocalCopyPath,
  };
}

module.exports = {
  DEFAULT_REPO_FOLDER_NAME,
  SIDECAR_FILE_SUFFIX,
  SQLITE_FILE_SUFFIX,
  SYNC_APP_NAME,
  SYNC_SCHEMA_VERSION,
  attachRepo,
  createSnapshot,
  initRepo,
  listAllSnapshots,
  pickBestSnapshot,
  pruneSnapshots,
  readDbMeta,
  repoExists,
  restoreSnapshotToLocal,
};
