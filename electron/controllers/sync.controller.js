const { dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {
  closeDatabase,
  createDatabase,
  getDatabase,
  getDatabasePath,
  runMigrations,
} = require('../database');
const { syncModel } = require('../models');
const { broadcastIpcEvent } = require('../ipc/broadcast');
const { formatTimestampForFilename } = require('../utils/file-utils');
const { getSettingsSection, setSettingsSection } = require('../utils/settings-store');
const {
  assertAllowedKeys,
  ensureNonEmptyObject,
  ensurePlainObject,
  normalizeBooleanFlag,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  requireString,
} = require('./utils');

const SYNC_SETTINGS_SECTION_KEY = 'sync';
const SYNC_SETTINGS_FIELDS = new Set([
  'enabled',
  'folderPath',
  'baseFolderPath',
  'repoFolderName',
  'deviceName',
  'autoPullIntervalMin',
  'autoPushIntervalMin',
  'autoPushOnQuit',
  'retentionCountPerDevice',
]);
const SYNC_SETTINGS_DEFAULTS = Object.freeze({
  enabled: false,
  folderPath: null,
  deviceId: null,
  autoPullIntervalMin: 10,
  autoPushIntervalMin: 30,
  autoPushOnQuit: true,
  lastPublishedCounter: null,
  lastPulledCounter: null,
  lastError: null,
});
const SYNC_STATE_DEFAULTS = Object.freeze({
  status: 'idle',
  lastPullAtMs: null,
  lastPushAtMs: null,
  lastError: null,
  remoteLatest: null,
  conflictInfo: null,
});
const SYNC_EVENT_CHANNELS = Object.freeze({
  stateChanged: 'sync:stateChanged',
  pullCompleted: 'sync:pullCompleted',
  pullFailed: 'sync:pullFailed',
  pushCompleted: 'sync:pushCompleted',
  pushFailed: 'sync:pushFailed',
  conflictDetected: 'sync:conflictDetected',
});
const LEGACY_REPO_ID = 'snapshot-index';

let autoPullTimer = null;
let autoPushTimer = null;
let runningSyncPromise = null;
let initialized = false;
let runtimeState = {
  ...SYNC_STATE_DEFAULTS,
};

function normalizeIntegerOrNull(value) {
  const normalizedValue = Number(value);
  return Number.isInteger(normalizedValue) ? normalizedValue : null;
}

function normalizeOptionalCounter(value, label) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalizedValue = normalizeIntegerOrNull(value);
  if (!Number.isInteger(normalizedValue) || normalizedValue < 0) {
    throw new Error(`${label} must be a non-negative integer or null.`);
  }

  return normalizedValue;
}

function resolveFolderPath(value, label = 'folderPath') {
  const normalizedFolderPath = path.resolve(requireString(value, label, { allowEmpty: false }));
  if (!fs.existsSync(normalizedFolderPath)) {
    throw new Error(`${label} does not exist: ${normalizedFolderPath}`);
  }

  const stats = fs.statSync(normalizedFolderPath);
  if (!stats.isDirectory()) {
    throw new Error(`${label} is not a directory: ${normalizedFolderPath}`);
  }

  fs.accessSync(normalizedFolderPath, fs.constants.R_OK | fs.constants.W_OK);
  return normalizedFolderPath;
}

function resolveSyncRootPath(folderPath) {
  if (typeof folderPath !== 'string' || folderPath.trim().length === 0) {
    return null;
  }

  return path.join(path.resolve(folderPath.trim()), syncModel.SYNC_CONTAINER_DIR_NAME);
}

function resolveIndexPath(folderPath) {
  const syncRootPath = resolveSyncRootPath(folderPath);
  return syncRootPath ? path.join(syncRootPath, syncModel.INDEX_FILE_NAME) : null;
}

function resolveSnapshotsDirPath(folderPath) {
  const syncRootPath = resolveSyncRootPath(folderPath);
  return syncRootPath ? path.join(syncRootPath, syncModel.SNAPSHOTS_DIR_NAME) : null;
}

function resolveSnapshotPath(folderPath, snapshotFile) {
  const snapshotsDirPath = resolveSnapshotsDirPath(folderPath);
  if (!snapshotsDirPath) {
    return null;
  }

  return path.join(snapshotsDirPath, requireString(snapshotFile, 'snapshotFile', { allowEmpty: false }));
}

function snapshotIdFromFile(snapshotFile) {
  if (typeof snapshotFile !== 'string' || !snapshotFile.endsWith(syncModel.SQLITE_FILE_SUFFIX)) {
    return null;
  }

  return snapshotFile.slice(0, -syncModel.SQLITE_FILE_SUFFIX.length);
}

function cloneConflictInfo() {
  if (!runtimeState.conflictInfo) {
    return null;
  }

  return {
    localCopyPath: runtimeState.conflictInfo.localCopyPath,
    remoteSnapshotPath: runtimeState.conflictInfo.remoteSnapshotPath,
    reason: runtimeState.conflictInfo.reason,
  };
}

function cloneRemoteLatest() {
  if (!runtimeState.remoteLatest) {
    return null;
  }

  return {
    changeCounter: runtimeState.remoteLatest.changeCounter,
    lastWriteMs: runtimeState.remoteLatest.lastWriteMs,
    file: runtimeState.remoteLatest.file,
  };
}

function cloneState() {
  return {
    status: runtimeState.status,
    lastPullAtMs: runtimeState.lastPullAtMs,
    lastPushAtMs: runtimeState.lastPushAtMs,
    lastError: runtimeState.lastError,
    remoteLatest: cloneRemoteLatest(),
    conflictInfo: cloneConflictInfo(),
  };
}

function broadcastStateChanged() {
  broadcastIpcEvent(SYNC_EVENT_CHANNELS.stateChanged, cloneState());
}

function setRuntimeState(patch) {
  runtimeState = {
    ...runtimeState,
    ...patch,
  };

  broadcastStateChanged();
}

function normalizeRemoteLatest(indexLatest) {
  if (!indexLatest) {
    return null;
  }

  const changeCounter = normalizeIntegerOrNull(indexLatest.change_counter);
  const lastWriteMs = normalizeIntegerOrNull(indexLatest.last_write_ms);
  const file =
    typeof indexLatest.file === 'string' && indexLatest.file.trim().length > 0 ? indexLatest.file.trim() : null;

  if (!Number.isInteger(changeCounter) || !Number.isInteger(lastWriteMs) || !file) {
    return null;
  }

  return {
    changeCounter,
    lastWriteMs,
    file,
  };
}

function setRunningState() {
  setRuntimeState({
    status: 'running',
    lastError: null,
  });
}

function setSuccessState(patch = {}) {
  setRuntimeState({
    status: 'ok',
    lastError: null,
    conflictInfo: null,
    ...patch,
  });
}

function setIdleState() {
  setRuntimeState({
    status: 'idle',
    lastError: null,
    conflictInfo: null,
  });
}

function setErrorState(errorMessage, patch = {}) {
  setRuntimeState({
    status: 'error',
    lastError: errorMessage,
    conflictInfo: null,
    ...patch,
  });
}

function emitConflict(conflictInfo, patch = {}) {
  const normalizedConflictInfo = {
    localCopyPath: conflictInfo.localCopyPath ?? null,
    remoteSnapshotPath: conflictInfo.remoteSnapshotPath ?? null,
    reason: conflictInfo.reason,
  };

  setRuntimeState({
    status: 'conflict',
    lastError: normalizedConflictInfo.reason,
    conflictInfo: normalizedConflictInfo,
    ...patch,
  });
  broadcastIpcEvent(SYNC_EVENT_CHANNELS.conflictDetected, normalizedConflictInfo);
}

function cloneSettings(settings) {
  return {
    enabled: settings.enabled,
    folderPath: settings.folderPath,
    deviceId: settings.deviceId,
    autoPullIntervalMin: settings.autoPullIntervalMin,
    autoPushIntervalMin: settings.autoPushIntervalMin,
    autoPushOnQuit: settings.autoPushOnQuit,
    lastPublishedCounter: settings.lastPublishedCounter,
    lastPulledCounter: settings.lastPulledCounter,
    lastError: settings.lastError,
  };
}

function readIndexedSnapshotId(folderPath) {
  const indexPath = resolveIndexPath(folderPath);
  if (!indexPath) {
    return null;
  }

  const indexValue = syncModel.readIndex(indexPath);
  return snapshotIdFromFile(indexValue?.latest?.file ?? null);
}

function buildPublicSettings(settings) {
  const syncRootPath = resolveSyncRootPath(settings.folderPath);

  return {
    ...cloneSettings(settings),
    baseFolderPath: settings.folderPath,
    repoFolderName: syncModel.SYNC_CONTAINER_DIR_NAME,
    repoPath: syncRootPath,
    deviceName: null,
    retentionCountPerDevice: 1,
    lastSeenRemoteSnapshotId: readIndexedSnapshotId(settings.folderPath),
    lastPublishedLocalCounter: settings.lastPublishedCounter,
  };
}

function normalizeSettingsFromStore(value) {
  const storedValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalizedSettings = {
    ...SYNC_SETTINGS_DEFAULTS,
  };

  try {
    if (storedValue.enabled !== undefined) {
      normalizedSettings.enabled = normalizeBooleanFlag(storedValue.enabled, 'settings.enabled') === 1;
    }
  } catch {
    normalizedSettings.enabled = SYNC_SETTINGS_DEFAULTS.enabled;
  }

  const folderPathSource =
    storedValue.folderPath !== undefined
      ? 'folderPath'
      : storedValue.baseFolderPath !== undefined
        ? 'baseFolderPath'
        : storedValue.repoPath !== undefined
          ? 'repoPath'
          : null;
  const rawFolderPath = folderPathSource ? storedValue[folderPathSource] : undefined;

  try {
    if (rawFolderPath !== undefined) {
      const normalizedFolderPath =
        normalizeOptionalString(rawFolderPath, 'settings.folderPath', { allowNull: true }) ?? null;
      if (!normalizedFolderPath) {
        normalizedSettings.folderPath = null;
      } else if (folderPathSource === 'repoPath') {
        normalizedSettings.folderPath = path.dirname(path.resolve(normalizedFolderPath));
      } else {
        normalizedSettings.folderPath = path.resolve(normalizedFolderPath);
      }
    }
  } catch {
    normalizedSettings.folderPath = SYNC_SETTINGS_DEFAULTS.folderPath;
  }

  if (typeof storedValue.deviceId === 'string' && storedValue.deviceId.trim().length > 0) {
    normalizedSettings.deviceId = storedValue.deviceId.trim();
  } else {
    normalizedSettings.deviceId = randomUUID();
  }

  try {
    if (storedValue.autoPullIntervalMin !== undefined) {
      normalizedSettings.autoPullIntervalMin = normalizeNonNegativeInteger(
        storedValue.autoPullIntervalMin,
        'settings.autoPullIntervalMin',
      );
    }
  } catch {
    normalizedSettings.autoPullIntervalMin = SYNC_SETTINGS_DEFAULTS.autoPullIntervalMin;
  }

  try {
    if (storedValue.autoPushIntervalMin !== undefined) {
      normalizedSettings.autoPushIntervalMin = normalizeNonNegativeInteger(
        storedValue.autoPushIntervalMin,
        'settings.autoPushIntervalMin',
      );
    }
  } catch {
    normalizedSettings.autoPushIntervalMin = SYNC_SETTINGS_DEFAULTS.autoPushIntervalMin;
  }

  try {
    if (storedValue.autoPushOnQuit !== undefined) {
      normalizedSettings.autoPushOnQuit =
        normalizeBooleanFlag(storedValue.autoPushOnQuit, 'settings.autoPushOnQuit') === 1;
    }
  } catch {
    normalizedSettings.autoPushOnQuit = SYNC_SETTINGS_DEFAULTS.autoPushOnQuit;
  }

  try {
    const normalizedLastPublishedCounter = normalizeOptionalCounter(
      storedValue.lastPublishedCounter !== undefined
        ? storedValue.lastPublishedCounter
        : storedValue.lastPublishedLocalCounter,
      'settings.lastPublishedCounter',
    );
    if (normalizedLastPublishedCounter !== undefined) {
      normalizedSettings.lastPublishedCounter = normalizedLastPublishedCounter;
    }
  } catch {
    normalizedSettings.lastPublishedCounter = SYNC_SETTINGS_DEFAULTS.lastPublishedCounter;
  }

  try {
    const normalizedLastPulledCounter = normalizeOptionalCounter(
      storedValue.lastPulledCounter,
      'settings.lastPulledCounter',
    );
    if (normalizedLastPulledCounter !== undefined) {
      normalizedSettings.lastPulledCounter = normalizedLastPulledCounter;
    }
  } catch {
    normalizedSettings.lastPulledCounter = SYNC_SETTINGS_DEFAULTS.lastPulledCounter;
  }

  try {
    if (storedValue.lastError !== undefined) {
      normalizedSettings.lastError =
        normalizeOptionalString(storedValue.lastError, 'settings.lastError', { allowNull: true }) ?? null;
    }
  } catch {
    normalizedSettings.lastError = SYNC_SETTINGS_DEFAULTS.lastError;
  }

  if (!normalizedSettings.folderPath) {
    normalizedSettings.enabled = false;
  }

  return normalizedSettings;
}

function readSyncSettings() {
  const storedSettings = getSettingsSection(SYNC_SETTINGS_SECTION_KEY, SYNC_SETTINGS_DEFAULTS);
  const normalizedSettings = normalizeSettingsFromStore(storedSettings);
  const normalizedStoredValue = JSON.stringify(cloneSettings(normalizedSettings));
  const currentStoredValue = JSON.stringify(storedSettings);

  if (normalizedStoredValue !== currentStoredValue) {
    setSettingsSection(SYNC_SETTINGS_SECTION_KEY, cloneSettings(normalizedSettings));
  }

  return normalizedSettings;
}

function persistSyncSettings(settings) {
  return normalizeSettingsFromStore(setSettingsSection(SYNC_SETTINGS_SECTION_KEY, cloneSettings(settings)));
}

function persistSettingsPatch(patch) {
  const currentSettings = readSyncSettings();
  return persistSyncSettings({
    ...currentSettings,
    ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
  });
}

function applySyncSettingsPatch(currentSettings, patch) {
  const nextSettings = {
    ...currentSettings,
  };

  if (patch.enabled !== undefined) {
    nextSettings.enabled = normalizeBooleanFlag(patch.enabled, 'payload.enabled') === 1;
  }

  const nextFolderPathValue = patch.folderPath !== undefined ? patch.folderPath : patch.baseFolderPath;
  if (nextFolderPathValue !== undefined) {
    nextSettings.folderPath =
      normalizeOptionalString(nextFolderPathValue, 'payload.folderPath', { allowNull: true }) ?? null;
    if (nextSettings.folderPath) {
      nextSettings.folderPath = resolveFolderPath(nextSettings.folderPath);
    }
  }

  if (patch.autoPullIntervalMin !== undefined) {
    nextSettings.autoPullIntervalMin = normalizeNonNegativeInteger(
      patch.autoPullIntervalMin,
      'payload.autoPullIntervalMin',
    );
  }

  if (patch.autoPushIntervalMin !== undefined) {
    nextSettings.autoPushIntervalMin = normalizeNonNegativeInteger(
      patch.autoPushIntervalMin,
      'payload.autoPushIntervalMin',
    );
  }

  if (patch.autoPushOnQuit !== undefined) {
    nextSettings.autoPushOnQuit = normalizeBooleanFlag(patch.autoPushOnQuit, 'payload.autoPushOnQuit') === 1;
  }

  if (nextSettings.enabled && !nextSettings.folderPath) {
    throw new Error('payload.folderPath is required when enabling sync.');
  }

  return nextSettings;
}

function clearSchedulers() {
  if (autoPullTimer) {
    clearInterval(autoPullTimer);
    autoPullTimer = null;
  }

  if (autoPushTimer) {
    clearInterval(autoPushTimer);
    autoPushTimer = null;
  }
}

function restartSchedulers(settings = readSyncSettings()) {
  clearSchedulers();

  if (!settings.enabled || !settings.folderPath) {
    return;
  }

  if (settings.autoPullIntervalMin > 0) {
    autoPullTimer = setInterval(() => {
      void pullNow().catch((error) => {
        console.error('[electron] Scheduled sync pull failed:', error);
      });
    }, settings.autoPullIntervalMin * 60 * 1000);
  }

  if (settings.autoPushIntervalMin > 0) {
    autoPushTimer = setInterval(() => {
      void pushNow().catch((error) => {
        console.error('[electron] Scheduled sync push failed:', error);
      });
    }, settings.autoPushIntervalMin * 60 * 1000);
  }
}

async function runSyncTask(task) {
  if (runningSyncPromise) {
    throw new Error('A sync operation is already running.');
  }

  runningSyncPromise = Promise.resolve().then(task);

  try {
    return await runningSyncPromise;
  } finally {
    runningSyncPromise = null;
  }
}

async function waitForRunningSync() {
  if (!runningSyncPromise) {
    return;
  }

  try {
    await runningSyncPromise;
  } catch {
    // Ignore the current failure while waiting for a safe shutdown or reconfiguration.
  }
}

function ensureConfiguredSettings(settings, options = {}) {
  const requireEnabled = options.requireEnabled !== false;

  if (requireEnabled && !settings.enabled) {
    throw new Error('Sync is disabled.');
  }

  if (!settings.folderPath) {
    throw new Error('Sync folder is not configured.');
  }

  return syncModel.ensureSyncDirs(settings.folderPath);
}

function assertCompleteLocalMeta(localMeta) {
  const dbUuid =
    typeof localMeta?.db_uuid === 'string' && localMeta.db_uuid.trim().length > 0 ? localMeta.db_uuid.trim() : null;
  const changeCounter = normalizeIntegerOrNull(localMeta?.change_counter);
  const lastWriteMs = normalizeIntegerOrNull(localMeta?.last_write_ms);
  const schemaVersion = normalizeIntegerOrNull(localMeta?.schema_version);

  if (!dbUuid || !Number.isInteger(changeCounter) || changeCounter < 0) {
    throw new Error('Local database metadata is missing a valid app_meta.db_uuid or app_meta.change_counter.');
  }

  if (!Number.isInteger(lastWriteMs) || lastWriteMs < 0) {
    throw new Error('Local database metadata is missing a valid app_meta.last_write_ms.');
  }

  if (!Number.isInteger(schemaVersion) || schemaVersion < 0) {
    throw new Error('Local database metadata is missing a valid app_meta.schema_version.');
  }

  return {
    db_uuid: dbUuid,
    change_counter: changeCounter,
    last_write_ms: lastWriteMs,
    schema_version: schemaVersion,
  };
}

function hasLocalChangesSinceLastPublish(localMeta, lastPublishedCounter) {
  if (!Number.isInteger(localMeta.change_counter)) {
    return true;
  }

  if (!Number.isInteger(lastPublishedCounter)) {
    return true;
  }

  return localMeta.change_counter > lastPublishedCounter;
}

function buildActionBase(settings) {
  return {
    repoId: LEGACY_REPO_ID,
    repoPath: resolveSyncRootPath(settings.folderPath),
  };
}

function buildRemoteInfo(indexLatest) {
  const normalizedRemote = normalizeRemoteLatest(indexLatest);
  if (!normalizedRemote) {
    return undefined;
  }

  return normalizedRemote;
}

function buildConflictInfo(localCopyPath, remoteSnapshotPath, reason) {
  return {
    localCopyPath: localCopyPath ?? null,
    remoteSnapshotPath,
    reason,
  };
}

function resolveUniqueLocalCopyPath(localDbPath, prefix) {
  const normalizedLocalDbPath = path.resolve(localDbPath);
  const localDirectoryPath = path.dirname(normalizedLocalDbPath);
  const extension = path.extname(normalizedLocalDbPath) || '.sqlite';
  const suffix = formatTimestampForFilename();
  const normalizedPrefix = requireString(prefix, 'prefix', { allowEmpty: false });
  let candidatePath = path.join(localDirectoryPath, `${normalizedPrefix}-${suffix}${extension}`);
  let index = 1;

  while (fs.existsSync(candidatePath)) {
    candidatePath = path.join(localDirectoryPath, `${normalizedPrefix}-${suffix}-${index}${extension}`);
    index += 1;
  }

  return candidatePath;
}

function movePreviousLocalCopyToConflict(previousLocalCopyPath, localDbPath) {
  if (typeof previousLocalCopyPath !== 'string' || previousLocalCopyPath.trim().length === 0) {
    return null;
  }

  const normalizedPreviousLocalCopyPath = previousLocalCopyPath.trim();
  if (!fs.existsSync(normalizedPreviousLocalCopyPath)) {
    return null;
  }

  const conflictCopyPath = resolveUniqueLocalCopyPath(localDbPath, 'db-local-conflict');
  fs.renameSync(normalizedPreviousLocalCopyPath, conflictCopyPath);
  return conflictCopyPath;
}

async function restoreSnapshotIntoLocal(snapshotPath, options = {}) {
  const localDbPath = getDatabasePath();
  let databaseReopened = false;

  try {
    closeDatabase();
    const restoreResult = syncModel.restoreSnapshotToLocal(snapshotPath, localDbPath);
    const conflictLocalCopyPath = options.markConflict
      ? movePreviousLocalCopyToConflict(restoreResult.previousLocalCopyPath, localDbPath)
      : null;
    const database = createDatabase();
    runMigrations(database);
    databaseReopened = true;

    return {
      ...restoreResult,
      conflictLocalCopyPath,
    };
  } catch (error) {
    if (!databaseReopened) {
      try {
        const database = createDatabase();
        runMigrations(database);
      } catch (reopenError) {
        console.error('[electron] Failed to reopen database after sync restore error:', reopenError);
      }
    }

    throw error;
  }
}

function updateStoredError(errorMessage) {
  return persistSettingsPatch({
    lastError: errorMessage,
  });
}

function buildPullCompletedResult(settings, indexLatest, snapshotPath, restoreResult) {
  return {
    ...buildActionBase(settings),
    action: 'pulled',
    pulled: true,
    remote: buildRemoteInfo(indexLatest),
    snapshotId: snapshotIdFromFile(indexLatest.file),
    snapshotFile: indexLatest.file,
    snapshotFilePath: snapshotPath,
    restoredFrom: restoreResult.restoredFrom,
    restoredTo: restoreResult.restoredTo,
    previousLocalCopyPath: restoreResult.previousLocalCopyPath,
    createdAtMs: indexLatest.created_at_ms,
  };
}

function buildPushCompletedResult(settings, snapshotResult, indexUpdated) {
  return {
    ...buildActionBase(settings),
    action: 'pushed',
    pushed: true,
    snapshotId: snapshotIdFromFile(snapshotResult.file),
    snapshotFile: snapshotResult.file,
    snapshotFilePath: snapshotResult.filePath,
    createdAtMs: snapshotResult.created_at_ms,
    sizeBytes: snapshotResult.size_bytes,
    meta: snapshotResult.meta,
    indexUpdated,
  };
}

function handlePullFailure(error, currentIndexLatest = null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  updateStoredError(errorMessage);
  setErrorState(errorMessage, {
    remoteLatest: normalizeRemoteLatest(currentIndexLatest),
  });
  broadcastIpcEvent(SYNC_EVENT_CHANNELS.pullFailed, { error: errorMessage });
  throw error;
}

function handlePushFailure(error, currentIndexLatest = null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  updateStoredError(errorMessage);
  setErrorState(errorMessage, {
    remoteLatest: normalizeRemoteLatest(currentIndexLatest),
  });
  broadcastIpcEvent(SYNC_EVENT_CHANNELS.pushFailed, { error: errorMessage });
  throw error;
}

async function performPull(settings, options = {}) {
  const currentSettings = normalizeSettingsFromStore(settings);
  let currentIndexLatest = null;

  try {
    const syncPaths = ensureConfiguredSettings(currentSettings, {
      requireEnabled: options.requireEnabled !== false,
    });
    const localMeta = assertCompleteLocalMeta(syncModel.getLocalDbMeta(getDatabase()));
    const indexValue = syncModel.readIndex(syncPaths.indexPath);

    currentIndexLatest = indexValue?.latest ?? null;
    if (!currentIndexLatest) {
      const persistedSettings = persistSettingsPatch({ lastError: null });
      setSuccessState({
        remoteLatest: null,
      });

      return {
        ...buildActionBase(persistedSettings),
        action: 'skipped',
        pulled: false,
        reason: 'No remote snapshot is indexed.',
      };
    }

    const remoteLatest = buildRemoteInfo(currentIndexLatest);
    const snapshotPath = resolveSnapshotPath(currentSettings.folderPath, currentIndexLatest.file);
    if (!snapshotPath || !fs.existsSync(snapshotPath)) {
      throw new Error(`Indexed snapshot file is missing: ${currentIndexLatest.file}`);
    }

    if (currentIndexLatest.db_uuid !== localMeta.db_uuid) {
      const restoreResult = await restoreSnapshotIntoLocal(snapshotPath, { markConflict: true });
      const persistedSettings = persistSettingsPatch({
        lastPulledCounter: currentIndexLatest.change_counter,
        lastPublishedCounter: currentIndexLatest.change_counter,
        lastError: 'db_uuid mismatch; remote adopted; local preserved',
      });
      const conflictInfo = buildConflictInfo(
        restoreResult.conflictLocalCopyPath,
        snapshotPath,
        'db_uuid mismatch; remote adopted; local preserved',
      );
      const pullResult = {
        ...buildActionBase(persistedSettings),
        action: 'conflict',
        pulled: true,
        restoredRemote: true,
        remote: remoteLatest,
        snapshotId: snapshotIdFromFile(currentIndexLatest.file),
        snapshotFile: currentIndexLatest.file,
        snapshotFilePath: snapshotPath,
        restoredFrom: restoreResult.restoredFrom,
        restoredTo: restoreResult.restoredTo,
        previousLocalCopyPath: restoreResult.previousLocalCopyPath,
        createdAtMs: currentIndexLatest.created_at_ms,
        conflictInfo,
      };

      emitConflict(conflictInfo, {
        lastPullAtMs: Date.now(),
        remoteLatest,
      });

      return pullResult;
    }

    if (!syncModel.isRemoteNewer(currentIndexLatest, localMeta)) {
      const persistedSettings = persistSettingsPatch({ lastError: null });
      setSuccessState({
        remoteLatest,
      });

      return {
        ...buildActionBase(persistedSettings),
        action: 'skipped',
        pulled: false,
        remote: remoteLatest,
        reason: 'Remote snapshot is not newer than the local database.',
      };
    }

    const restoreResult = await restoreSnapshotIntoLocal(snapshotPath);
    const persistedSettings = persistSettingsPatch({
      lastPulledCounter: currentIndexLatest.change_counter,
      lastPublishedCounter: currentIndexLatest.change_counter,
      lastError: null,
    });
    const pullResult = buildPullCompletedResult(persistedSettings, currentIndexLatest, snapshotPath, restoreResult);

    setSuccessState({
      lastPullAtMs: Date.now(),
      remoteLatest,
    });
    broadcastIpcEvent(SYNC_EVENT_CHANNELS.pullCompleted, pullResult);

    return pullResult;
  } catch (error) {
    return handlePullFailure(error, currentIndexLatest);
  }
}

async function performPush(settings, options = {}) {
  const currentSettings = normalizeSettingsFromStore(settings);
  let currentIndexLatest = null;

  try {
    const syncPaths = ensureConfiguredSettings(currentSettings, {
      requireEnabled: options.requireEnabled !== false,
    });
    const localMeta = assertCompleteLocalMeta(syncModel.getLocalDbMeta(getDatabase()));
    const indexValue = syncModel.readIndex(syncPaths.indexPath);

    currentIndexLatest = indexValue?.latest ?? null;
    if (currentIndexLatest && currentIndexLatest.db_uuid !== localMeta.db_uuid) {
      const remoteLatest = buildRemoteInfo(currentIndexLatest);
      const snapshotPath = resolveSnapshotPath(currentSettings.folderPath, currentIndexLatest.file);
      if (!snapshotPath || !fs.existsSync(snapshotPath)) {
        throw new Error(`Indexed snapshot file is missing: ${currentIndexLatest.file}`);
      }

      const restoreResult = await restoreSnapshotIntoLocal(snapshotPath, { markConflict: true });
      const persistedSettings = persistSettingsPatch({
        lastPulledCounter: currentIndexLatest.change_counter,
        lastPublishedCounter: currentIndexLatest.change_counter,
        lastError: 'db_uuid mismatch; remote adopted; local preserved',
      });
      const conflictInfo = buildConflictInfo(
        restoreResult.conflictLocalCopyPath,
        snapshotPath,
        'db_uuid mismatch; remote adopted; local preserved',
      );
      const conflictResult = {
        ...buildActionBase(persistedSettings),
        action: 'conflict',
        pushed: false,
        pulled: true,
        restoredRemote: true,
        remote: remoteLatest,
        snapshotId: snapshotIdFromFile(currentIndexLatest.file),
        snapshotFile: currentIndexLatest.file,
        snapshotFilePath: snapshotPath,
        restoredFrom: restoreResult.restoredFrom,
        restoredTo: restoreResult.restoredTo,
        previousLocalCopyPath: restoreResult.previousLocalCopyPath,
        createdAtMs: currentIndexLatest.created_at_ms,
        conflictInfo,
      };

      emitConflict(conflictInfo, {
        lastPullAtMs: Date.now(),
        remoteLatest,
      });

      return conflictResult;
    }

    if (!hasLocalChangesSinceLastPublish(localMeta, currentSettings.lastPublishedCounter)) {
      const persistedSettings = persistSettingsPatch({ lastError: null });
      setSuccessState({
        remoteLatest: normalizeRemoteLatest(currentIndexLatest),
      });

      return {
        ...buildActionBase(persistedSettings),
        action: 'skipped',
        pushed: false,
        reason: 'Local database has no unpublished changes.',
      };
    }

    const snapshotResult = await syncModel.createSnapshot(
      getDatabase(),
      syncPaths.snapshotsDir,
      currentSettings.deviceId,
      localMeta,
    );
    const nextIndexLatest = {
      file: snapshotResult.file,
      db_uuid: localMeta.db_uuid,
      change_counter: localMeta.change_counter,
      last_write_ms: localMeta.last_write_ms,
      created_at_ms: snapshotResult.created_at_ms,
      device_id: currentSettings.deviceId,
    };
    let indexUpdated = false;

    if (syncModel.isLocalNewerThanIndex(localMeta, currentIndexLatest)) {
      syncModel.writeIndexAtomic(syncPaths.indexPath, {
        schema_version: syncModel.SYNC_SCHEMA_VERSION,
        updated_at_ms: Date.now(),
        latest: nextIndexLatest,
      });
      currentIndexLatest = nextIndexLatest;
      indexUpdated = true;
    }

    const persistedSettings = persistSettingsPatch({
      lastPublishedCounter: localMeta.change_counter,
      lastError: null,
    });
    const pushResult = buildPushCompletedResult(persistedSettings, snapshotResult, indexUpdated);

    setSuccessState({
      lastPushAtMs: Date.now(),
      remoteLatest: normalizeRemoteLatest(currentIndexLatest),
    });
    broadcastIpcEvent(SYNC_EVENT_CHANNELS.pushCompleted, pushResult);

    return pushResult;
  } catch (error) {
    return handlePushFailure(error, currentIndexLatest);
  }
}

function init() {
  if (initialized) {
    return;
  }

  initialized = true;
  const settings = readSyncSettings();
  const indexPath = resolveIndexPath(settings.folderPath);
  const indexValue = indexPath ? syncModel.readIndex(indexPath) : null;

  runtimeState = {
    ...SYNC_STATE_DEFAULTS,
    status: settings.lastError ? 'error' : SYNC_STATE_DEFAULTS.status,
    lastError: settings.lastError,
    remoteLatest: normalizeRemoteLatest(indexValue?.latest ?? null),
  };
  restartSchedulers(settings);
}

function dispose() {
  clearSchedulers();
  initialized = false;
}

function getSettings() {
  return buildPublicSettings(readSyncSettings());
}

function updateSettings(payload) {
  const patch = ensureNonEmptyObject(payload, 'payload');
  assertAllowedKeys(patch, SYNC_SETTINGS_FIELDS, 'payload');

  const currentSettings = readSyncSettings();
  const nextSettings = applySyncSettingsPatch(currentSettings, patch);

  if (nextSettings.enabled && nextSettings.folderPath) {
    syncModel.ensureSyncDirs(nextSettings.folderPath);
  }

  const persistedSettings = persistSyncSettings(nextSettings);
  restartSchedulers(persistedSettings);
  return buildPublicSettings(persistedSettings);
}

function getState() {
  return cloneState();
}

async function selectFolder() {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return {
    folderPath: result.filePaths[0],
  };
}

function resolveEnableFolderPath(payload) {
  if (typeof payload === 'string') {
    return resolveFolderPath(payload, 'folderPath');
  }

  const body = ensurePlainObject(payload, 'payload');
  const rawFolderPath = body.folderPath !== undefined ? body.folderPath : body.baseFolderPath;
  return resolveFolderPath(rawFolderPath, 'payload.folderPath');
}

async function enable(payload) {
  return runSyncTask(async () => {
    try {
      const folderPath = resolveEnableFolderPath(payload);
      const syncPaths = syncModel.ensureSyncDirs(folderPath);
      const currentSettings = readSyncSettings();
      const nextSettings = persistSyncSettings({
        ...currentSettings,
        enabled: true,
        folderPath: syncPaths.folderPath,
        lastError: null,
      });

      setRunningState();
      const pullResult = await performPull(nextSettings, { requireEnabled: false });
      if (pullResult.action !== 'conflict') {
        setRunningState();
        await performPush(readSyncSettings(), { requireEnabled: false });
      }

      restartSchedulers(readSyncSettings());
      return {
        ok: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (runtimeState.status !== 'error' || runtimeState.lastError !== errorMessage) {
        updateStoredError(errorMessage);
        setErrorState(errorMessage);
      }

      throw error;
    }
  });
}

async function disable() {
  clearSchedulers();
  await waitForRunningSync();

  const currentSettings = readSyncSettings();
  const nextSettings = persistSyncSettings({
    ...currentSettings,
    enabled: false,
    lastError: null,
  });

  restartSchedulers(nextSettings);
  setIdleState();

  return {
    ok: true,
  };
}

async function syncNow() {
  return runSyncTask(async () => {
    const skipped = [];

    setRunningState();
    const pullResult = await performPull(readSyncSettings());
    if (!pullResult.pulled && pullResult.reason) {
      skipped.push(pullResult.reason);
    }

    if (pullResult.action === 'conflict') {
      skipped.push('Push skipped because a db_uuid mismatch was resolved from the remote snapshot.');
      return {
        pulled: true,
        pushed: false,
        skipped: skipped.length > 0 ? skipped : undefined,
        pullResult,
        pushResult: {
          ...buildActionBase(readSyncSettings()),
          action: 'skipped',
          pushed: false,
          reason: 'Push skipped because a db_uuid mismatch was resolved from the remote snapshot.',
        },
      };
    }

    setRunningState();
    const pushResult = await performPush(readSyncSettings());
    if (!pushResult.pushed && pushResult.reason) {
      skipped.push(pushResult.reason);
    }

    return {
      pulled: Boolean(pullResult.pulled),
      pushed: Boolean(pushResult.pushed),
      skipped: skipped.length > 0 ? skipped : undefined,
      pullResult,
      pushResult,
    };
  });
}

async function pullNow() {
  return runSyncTask(async () => {
    setRunningState();
    return performPull(readSyncSettings());
  });
}

async function pushNow() {
  return runSyncTask(async () => {
    setRunningState();
    return performPush(readSyncSettings());
  });
}

function repoStatus(payload) {
  let folderPath = readSyncSettings().folderPath;

  if (payload !== undefined && payload !== null) {
    if (typeof payload === 'string') {
      folderPath = resolveFolderPath(payload, 'folderPath');
    } else {
      const body = ensurePlainObject(payload, 'payload');
      if (body.folderPath !== undefined || body.baseFolderPath !== undefined) {
        folderPath = resolveFolderPath(
          body.folderPath !== undefined ? body.folderPath : body.baseFolderPath,
          'payload.folderPath',
        );
      }
    }
  }

  const syncRootPath = resolveSyncRootPath(folderPath);
  if (!syncRootPath) {
    return {
      exists: false,
      repoPath: null,
    };
  }

  const exists = fs.existsSync(syncRootPath) && fs.statSync(syncRootPath).isDirectory();
  if (!exists) {
    return {
      exists: false,
      repoPath: syncRootPath,
    };
  }

  const indexPath = resolveIndexPath(folderPath);
  const indexValue = indexPath ? syncModel.readIndex(indexPath) : null;

  return {
    exists: true,
    repoPath: syncRootPath,
    repoMeta: {
      repoId: LEGACY_REPO_ID,
      createdAtMs: indexValue?.updated_at_ms ?? Math.round(fs.statSync(syncRootPath).mtimeMs),
      syncSchemaVersion: syncModel.SYNC_SCHEMA_VERSION,
      appName: 'Boring Balance',
      repoPath: syncRootPath,
      repoFilePath: indexPath ?? undefined,
    },
  };
}

async function enableCreateRepo(payload) {
  await enable(payload);
  const folderPath = resolveEnableFolderPath(payload);

  return {
    repoId: LEGACY_REPO_ID,
    repoPath: resolveSyncRootPath(folderPath),
    actionTaken: 'enabled',
  };
}

async function enableAttachRepo(payload) {
  await enable(payload);
  const folderPath = resolveEnableFolderPath(payload);

  return {
    repoId: LEGACY_REPO_ID,
    repoPath: resolveSyncRootPath(folderPath),
    actionTaken: 'enabled',
  };
}

function listSnapshots() {
  const settings = readSyncSettings();
  if (!settings.folderPath) {
    return [];
  }

  return syncModel.listSnapshots(settings.folderPath);
}

async function onAppBeforeQuit() {
  clearSchedulers();
  await waitForRunningSync();

  const settings = readSyncSettings();
  if (!settings.enabled || !settings.autoPushOnQuit || !settings.folderPath) {
    return null;
  }

  try {
    return await runSyncTask(async () => {
      setRunningState();
      return performPush(readSyncSettings());
    });
  } catch (error) {
    console.error('[electron] Sync before quit failed:', error);
    return null;
  }
}

module.exports = {
  disable,
  disableSync: disable,
  dispose,
  enable,
  enableAttachRepo,
  enableCreateRepo,
  getSettings,
  getState,
  init,
  listSnapshots,
  onAppBeforeQuit,
  pullNow,
  pushNow,
  repoStatus,
  selectFolder,
  syncNow,
  updateSettings,
};
