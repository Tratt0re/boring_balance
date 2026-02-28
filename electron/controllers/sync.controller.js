const { app, dialog } = require('electron');
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
  normalizePositiveInteger,
  requireString,
} = require('./utils');

const SYNC_SETTINGS_SECTION_KEY = 'sync';
const SYNC_SETTINGS_FIELDS = new Set([
  'repoFolderName',
  'deviceName',
  'autoPullIntervalMin',
  'autoPushIntervalMin',
  'autoPushOnQuit',
  'retentionCountPerDevice',
]);
const SYNC_SETTINGS_DEFAULTS = Object.freeze({
  enabled: false,
  baseFolderPath: null,
  repoFolderName: syncModel.DEFAULT_REPO_FOLDER_NAME,
  repoPath: null,
  deviceId: null,
  deviceName: null,
  autoPullIntervalMin: 0,
  autoPushIntervalMin: 0,
  autoPushOnQuit: true,
  retentionCountPerDevice: 3,
  lastSeenRemoteSnapshotId: null,
  lastPublishedLocalCounter: null,
});
const SYNC_STATE_DEFAULTS = Object.freeze({
  status: 'idle',
  lastPullAtMs: null,
  lastPushAtMs: null,
  lastError: null,
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

function normalizeRepoFolderName(value, label) {
  const normalizedValue = requireString(value, label, { allowEmpty: false });
  if (normalizedValue.includes('/') || normalizedValue.includes('\\')) {
    throw new Error(`${label} cannot contain path separators.`);
  }

  return normalizedValue;
}

function deriveRepoPath(baseFolderPath, repoFolderName) {
  if (typeof baseFolderPath !== 'string' || baseFolderPath.trim().length === 0) {
    return null;
  }

  return path.resolve(baseFolderPath.trim(), repoFolderName);
}

function cloneSettings(settings) {
  return {
    enabled: settings.enabled,
    baseFolderPath: settings.baseFolderPath,
    repoFolderName: settings.repoFolderName,
    repoPath: settings.repoPath,
    deviceId: settings.deviceId,
    deviceName: settings.deviceName,
    autoPullIntervalMin: settings.autoPullIntervalMin,
    autoPushIntervalMin: settings.autoPushIntervalMin,
    autoPushOnQuit: settings.autoPushOnQuit,
    retentionCountPerDevice: settings.retentionCountPerDevice,
    lastSeenRemoteSnapshotId: settings.lastSeenRemoteSnapshotId,
    lastPublishedLocalCounter: settings.lastPublishedLocalCounter,
  };
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

function cloneState() {
  return {
    status: runtimeState.status,
    lastPullAtMs: runtimeState.lastPullAtMs,
    lastPushAtMs: runtimeState.lastPushAtMs,
    lastError: runtimeState.lastError,
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

function isSameLineage(localDbUuid, remoteDbUuid) {
  const normalizedLocalDbUuid =
    typeof localDbUuid === 'string' && localDbUuid.trim().length > 0 ? localDbUuid.trim() : null;
  const normalizedRemoteDbUuid =
    typeof remoteDbUuid === 'string' && remoteDbUuid.trim().length > 0 ? remoteDbUuid.trim() : null;

  return normalizedLocalDbUuid === normalizedRemoteDbUuid;
}

function hasCounterAdvanced(currentCounter, baselineCounter) {
  if (!Number.isInteger(currentCounter)) {
    return true;
  }

  if (!Number.isInteger(baselineCounter)) {
    return true;
  }

  return currentCounter > baselineCounter;
}

function resolveRemotePublishedCounter(remoteCounter) {
  return Number.isInteger(remoteCounter) ? remoteCounter : null;
}

function resolvePublishedSnapshotCounter(snapshotCounter, localCounter) {
  if (Number.isInteger(snapshotCounter)) {
    return snapshotCounter;
  }

  if (Number.isInteger(localCounter)) {
    return localCounter;
  }

  return null;
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

  try {
    if (storedValue.baseFolderPath !== undefined) {
      normalizedSettings.baseFolderPath =
        normalizeOptionalString(storedValue.baseFolderPath, 'settings.baseFolderPath', { allowNull: true }) ?? null;
    }
  } catch {
    normalizedSettings.baseFolderPath = SYNC_SETTINGS_DEFAULTS.baseFolderPath;
  }

  try {
    if (storedValue.repoFolderName !== undefined) {
      normalizedSettings.repoFolderName = normalizeRepoFolderName(storedValue.repoFolderName, 'settings.repoFolderName');
    }
  } catch {
    normalizedSettings.repoFolderName = SYNC_SETTINGS_DEFAULTS.repoFolderName;
  }

  normalizedSettings.repoPath = deriveRepoPath(normalizedSettings.baseFolderPath, normalizedSettings.repoFolderName);

  if (typeof storedValue.deviceId === 'string' && storedValue.deviceId.trim().length > 0) {
    normalizedSettings.deviceId = storedValue.deviceId.trim();
  } else {
    normalizedSettings.deviceId = randomUUID();
  }

  try {
    if (storedValue.deviceName !== undefined) {
      normalizedSettings.deviceName =
        normalizeOptionalString(storedValue.deviceName, 'settings.deviceName', { allowNull: true }) ?? null;
    }
  } catch {
    normalizedSettings.deviceName = SYNC_SETTINGS_DEFAULTS.deviceName;
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
    if (storedValue.retentionCountPerDevice !== undefined) {
      normalizedSettings.retentionCountPerDevice = normalizePositiveInteger(
        storedValue.retentionCountPerDevice,
        'settings.retentionCountPerDevice',
      );
    }
  } catch {
    normalizedSettings.retentionCountPerDevice = SYNC_SETTINGS_DEFAULTS.retentionCountPerDevice;
  }

  try {
    if (storedValue.lastSeenRemoteSnapshotId !== undefined) {
      normalizedSettings.lastSeenRemoteSnapshotId =
        normalizeOptionalString(storedValue.lastSeenRemoteSnapshotId, 'settings.lastSeenRemoteSnapshotId', {
          allowNull: true,
        }) ?? null;
    }
  } catch {
    normalizedSettings.lastSeenRemoteSnapshotId = SYNC_SETTINGS_DEFAULTS.lastSeenRemoteSnapshotId;
  }

  try {
    if (storedValue.lastPublishedLocalCounter !== undefined) {
      const normalizedCounter = normalizeIntegerOrNull(storedValue.lastPublishedLocalCounter);
      normalizedSettings.lastPublishedLocalCounter =
        Number.isInteger(normalizedCounter) && normalizedCounter >= 0 ? normalizedCounter : null;
    }
  } catch {
    normalizedSettings.lastPublishedLocalCounter = SYNC_SETTINGS_DEFAULTS.lastPublishedLocalCounter;
  }

  return normalizedSettings;
}

function readSyncSettings() {
  const storedSettings = getSettingsSection(SYNC_SETTINGS_SECTION_KEY, SYNC_SETTINGS_DEFAULTS);
  const normalizedSettings = normalizeSettingsFromStore(storedSettings);
  const normalizedStoredSettings = JSON.stringify(normalizedSettings);
  const normalizedExpectedSettings = JSON.stringify(storedSettings);

  if (normalizedStoredSettings !== normalizedExpectedSettings) {
    setSettingsSection(SYNC_SETTINGS_SECTION_KEY, normalizedSettings);
  }

  return normalizedSettings;
}

function persistSyncSettings(settings) {
  return normalizeSettingsFromStore(setSettingsSection(SYNC_SETTINGS_SECTION_KEY, cloneSettings(settings)));
}

function persistSettingsPatch(settings, patch = {}) {
  const nextSettings = normalizeSettingsFromStore({
    ...cloneSettings(settings),
    ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
  });

  return persistSyncSettings(nextSettings);
}

function applySyncSettingsPatch(currentSettings, patch) {
  const nextSettings = {
    ...cloneSettings(currentSettings),
  };

  if (patch.repoFolderName !== undefined) {
    if (currentSettings.enabled) {
      throw new Error('Cannot change repoFolderName while sync is enabled.');
    }

    nextSettings.repoFolderName = normalizeRepoFolderName(patch.repoFolderName, 'payload.repoFolderName');
  }

  if (patch.deviceName !== undefined) {
    nextSettings.deviceName =
      normalizeOptionalString(patch.deviceName, 'payload.deviceName', { allowNull: true }) ?? null;
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

  if (patch.retentionCountPerDevice !== undefined) {
    nextSettings.retentionCountPerDevice = normalizePositiveInteger(
      patch.retentionCountPerDevice,
      'payload.retentionCountPerDevice',
    );
  }

  return normalizeSettingsFromStore(nextSettings);
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

  if (!settings.enabled) {
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
    // Ignore current task failures when waiting for shutdown or reconfiguration.
  }
}

function ensureBaseFolderPath(baseFolderPath) {
  const normalizedBaseFolderPath = path.resolve(requireString(baseFolderPath, 'baseFolderPath', { allowEmpty: false }));
  if (!fs.existsSync(normalizedBaseFolderPath)) {
    throw new Error(`baseFolderPath does not exist: ${normalizedBaseFolderPath}`);
  }

  const stats = fs.statSync(normalizedBaseFolderPath);
  if (!stats.isDirectory()) {
    throw new Error(`baseFolderPath is not a directory: ${normalizedBaseFolderPath}`);
  }

  fs.accessSync(normalizedBaseFolderPath, fs.constants.R_OK | fs.constants.W_OK);
  return normalizedBaseFolderPath;
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

async function createLocalConflictCopy() {
  const localDbPath = getDatabasePath();
  const conflictCopyPath = resolveUniqueLocalCopyPath(localDbPath, 'db-local-conflict');
  const temporaryPath = `${conflictCopyPath}.tmp`;

  if (fs.existsSync(temporaryPath)) {
    fs.unlinkSync(temporaryPath);
  }

  try {
    await getDatabase().backup(temporaryPath);
    fs.renameSync(temporaryPath, conflictCopyPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }

    throw error;
  }

  return conflictCopyPath;
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

async function restoreSnapshotIntoLocal(snapshotInfo, options = {}) {
  const localDbPath = getDatabasePath();
  let databaseReopened = false;

  try {
    closeDatabase();
    const restoreResult = syncModel.restoreSnapshotToLocal(snapshotInfo.snapshotFilePath, localDbPath);
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

function setErrorState(errorMessage) {
  setRuntimeState({
    status: 'error',
    lastError: errorMessage,
  });
}

function emitConflict(conflictInfo, patch = {}) {
  const normalizedConflictInfo = {
    localCopyPath: conflictInfo.localCopyPath,
    remoteSnapshotPath: conflictInfo.remoteSnapshotPath,
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

function ensureConfiguredSettings(settings, options = {}) {
  const requireEnabled = options.requireEnabled !== false;

  if (requireEnabled && !settings.enabled) {
    throw new Error('Sync is disabled.');
  }

  if (!settings.baseFolderPath || !settings.repoPath) {
    throw new Error('Sync repository is not configured.');
  }

  return syncModel.attachRepo(settings.repoPath);
}

function extractEnablePayload(payload, options = {}) {
  if (typeof payload === 'string') {
    return {
      baseFolderPath: payload,
      deviceName: null,
    };
  }

  const body = ensurePlainObject(payload, 'payload');
  const baseFolderPath = body.baseFolderPath;
  const deviceName = options.allowDeviceName
    ? normalizeOptionalString(body.deviceName, 'payload.deviceName', { allowNull: true }) ?? null
    : null;

  return {
    baseFolderPath,
    deviceName,
  };
}

function buildRepoPathForBaseFolder(baseFolderPath, repoFolderName) {
  return deriveRepoPath(ensureBaseFolderPath(baseFolderPath), repoFolderName);
}

function buildConflictInfo(localCopyPath, snapshotInfo, reason) {
  return {
    localCopyPath,
    remoteSnapshotPath: snapshotInfo.snapshotFilePath,
    reason,
  };
}

async function performPull(settings, options = {}) {
  const currentSettings = normalizeSettingsFromStore(settings);

  try {
    const repoMeta = ensureConfiguredSettings(currentSettings, {
      requireEnabled: options.requireEnabled !== false,
    });
    const localMeta = syncModel.readDbMeta(getDatabase());
    const snapshots = syncModel.listAllSnapshots(repoMeta.repoPath);
    const selection = syncModel.pickBestSnapshot(snapshots, localMeta.dbUuid);

    if (!selection.snapshot) {
      persistSyncSettings(currentSettings);
      setSuccessState();

      return {
        action: 'skipped',
        reason: 'No remote snapshots were found.',
        repoId: repoMeta.repoId,
        selectionReason: selection.reason,
      };
    }

    const remoteSnapshot = selection.snapshot;
    const sameLineage = isSameLineage(localMeta.dbUuid, remoteSnapshot.meta?.db_uuid);
    const remoteCounter = normalizeIntegerOrNull(remoteSnapshot.meta?.change_counter);
    const publishedRemoteCounter = resolveRemotePublishedCounter(remoteCounter);

    if (!sameLineage) {
      const conflictReason = options.resolveConflictWithRemote
        ? 'Remote snapshot replaced the local database because the repository belongs to a different lineage.'
        : 'Remote snapshot belongs to a different database lineage.';

      if (options.resolveConflictWithRemote) {
        const restoreResult = await restoreSnapshotIntoLocal(remoteSnapshot, { markConflict: true });
        const persistedSettings = persistSettingsPatch(currentSettings, {
          lastSeenRemoteSnapshotId: remoteSnapshot.snapshotId,
          lastPublishedLocalCounter: publishedRemoteCounter,
        });
        const conflictInfo = buildConflictInfo(
          restoreResult.conflictLocalCopyPath,
          remoteSnapshot,
          conflictReason,
        );

        emitConflict(conflictInfo, {
          lastPullAtMs: remoteSnapshot.createdAtMs,
        });

        return {
          action: 'conflict',
          restoredRemote: true,
          repoId: repoMeta.repoId,
          repoPath: persistedSettings.repoPath,
          snapshotId: remoteSnapshot.snapshotId,
          selectionReason: selection.reason,
          conflictInfo,
        };
      }

      const localCopyPath = await createLocalConflictCopy();
      const persistedSettings = persistSettingsPatch(currentSettings, {
        lastSeenRemoteSnapshotId: remoteSnapshot.snapshotId,
      });
      const conflictInfo = buildConflictInfo(localCopyPath, remoteSnapshot, conflictReason);

      emitConflict(conflictInfo);

      return {
        action: 'conflict',
        restoredRemote: false,
        repoId: repoMeta.repoId,
        repoPath: persistedSettings.repoPath,
        snapshotId: remoteSnapshot.snapshotId,
        selectionReason: selection.reason,
        conflictInfo,
      };
    }

    const shouldRestore =
      (Number.isInteger(localMeta.changeCounter) && Number.isInteger(remoteCounter) && remoteCounter > localMeta.changeCounter)
      || (!Number.isInteger(localMeta.changeCounter)
        && Number.isInteger(remoteCounter)
        && options.preferRemoteWhenCounterUnknown === true);

    if (!shouldRestore) {
      const persistedSettings = persistSettingsPatch(currentSettings, {
        lastSeenRemoteSnapshotId: remoteSnapshot.snapshotId,
        lastPublishedLocalCounter: publishedRemoteCounter,
      });

      setSuccessState();

      return {
        action: 'skipped',
        reason: 'Remote snapshot is not newer than the local database.',
        repoId: repoMeta.repoId,
        repoPath: persistedSettings.repoPath,
        snapshotId: remoteSnapshot.snapshotId,
        selectionReason: selection.reason,
      };
    }

    const restoreResult = await restoreSnapshotIntoLocal(remoteSnapshot);
    const persistedSettings = persistSettingsPatch(currentSettings, {
      lastSeenRemoteSnapshotId: remoteSnapshot.snapshotId,
      lastPublishedLocalCounter: publishedRemoteCounter,
    });
    const pullResult = {
      action: 'pulled',
      repoId: repoMeta.repoId,
      repoPath: persistedSettings.repoPath,
      snapshotId: remoteSnapshot.snapshotId,
      snapshotFilePath: remoteSnapshot.snapshotFilePath,
      restoredFrom: restoreResult.restoredFrom,
      restoredTo: restoreResult.restoredTo,
      previousLocalCopyPath: restoreResult.previousLocalCopyPath,
      createdAtMs: remoteSnapshot.createdAtMs,
      selectionReason: selection.reason,
    };

    setSuccessState({
      lastPullAtMs: remoteSnapshot.createdAtMs,
    });
    broadcastIpcEvent(SYNC_EVENT_CHANNELS.pullCompleted, pullResult);

    return pullResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    setErrorState(errorMessage);
    broadcastIpcEvent(SYNC_EVENT_CHANNELS.pullFailed, { error: errorMessage });
    throw error;
  }
}

async function performPush(settings, options = {}) {
  const currentSettings = normalizeSettingsFromStore(settings);

  try {
    const repoMeta = ensureConfiguredSettings(currentSettings, {
      requireEnabled: options.requireEnabled !== false,
    });
    const localMeta = syncModel.readDbMeta(getDatabase());
    const snapshots = syncModel.listAllSnapshots(repoMeta.repoPath);
    const selection = syncModel.pickBestSnapshot(snapshots, localMeta.dbUuid);
    const remoteSnapshot = selection.snapshot;
    const remoteCounter = normalizeIntegerOrNull(remoteSnapshot?.meta?.change_counter);

    if (remoteSnapshot && !isSameLineage(localMeta.dbUuid, remoteSnapshot.meta?.db_uuid)) {
      const localCopyPath = await createLocalConflictCopy();
      const persistedSettings = persistSettingsPatch(currentSettings, {
        lastSeenRemoteSnapshotId: remoteSnapshot.snapshotId,
      });
      const conflictInfo = buildConflictInfo(
        localCopyPath,
        remoteSnapshot,
        'Cannot publish to a repository with a different database lineage.',
      );

      emitConflict(conflictInfo);

      return {
        action: 'conflict',
        repoId: repoMeta.repoId,
        repoPath: persistedSettings.repoPath,
        snapshotId: remoteSnapshot.snapshotId,
        selectionReason: selection.reason,
        conflictInfo,
      };
    }

    const baselineCounter = resolveRemotePublishedCounter(remoteCounter);
    if (!hasCounterAdvanced(localMeta.changeCounter, baselineCounter)) {
      const persistedSettings = persistSettingsPatch(currentSettings, {
        lastPublishedLocalCounter: baselineCounter,
        lastSeenRemoteSnapshotId: remoteSnapshot?.snapshotId ?? currentSettings.lastSeenRemoteSnapshotId,
      });

      setSuccessState();

      return {
        action: 'skipped',
        reason: 'Local database has no unpublished changes.',
        repoId: repoMeta.repoId,
        repoPath: persistedSettings.repoPath,
        selectionReason: selection.reason,
      };
    }

    const snapshotResult = await syncModel.createSnapshot(
      getDatabase(),
      repoMeta.repoPath,
      currentSettings.deviceId,
      app.getVersion(),
      currentSettings.deviceName,
    );
    const pruneResult = syncModel.pruneSnapshots(
      repoMeta.repoPath,
      currentSettings.deviceId,
      currentSettings.retentionCountPerDevice,
    );
    const publishedCounter = resolvePublishedSnapshotCounter(snapshotResult.meta?.change_counter, localMeta.changeCounter);
    const persistedSettings = persistSettingsPatch(currentSettings, {
      lastSeenRemoteSnapshotId: snapshotResult.snapshotId,
      lastPublishedLocalCounter: publishedCounter,
    });
    const pushResult = {
      action: 'pushed',
      repoId: repoMeta.repoId,
      repoPath: persistedSettings.repoPath,
      snapshotId: snapshotResult.snapshotId,
      snapshotFilePath: snapshotResult.snapshotFilePath,
      createdAtMs: snapshotResult.createdAtMs,
      sizeBytes: snapshotResult.sizeBytes,
      meta: snapshotResult.meta,
      prune: pruneResult,
    };

    setSuccessState({
      lastPushAtMs: snapshotResult.createdAtMs,
    });
    broadcastIpcEvent(SYNC_EVENT_CHANNELS.pushCompleted, pushResult);

    return pushResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    setErrorState(errorMessage);
    broadcastIpcEvent(SYNC_EVENT_CHANNELS.pushFailed, { error: errorMessage });
    throw error;
  }
}

function init() {
  if (initialized) {
    return;
  }

  initialized = true;
  const settings = readSyncSettings();
  restartSchedulers(settings);

  if (settings.enabled && settings.repoPath) {
    void pullNow().catch((error) => {
      console.error('[electron] Startup sync pull failed:', error);
    });
  }
}

function dispose() {
  clearSchedulers();
  initialized = false;
}

function getSettings() {
  return readSyncSettings();
}

function updateSettings(payload) {
  const patch = ensureNonEmptyObject(payload, 'payload');
  assertAllowedKeys(patch, SYNC_SETTINGS_FIELDS, 'payload');

  const currentSettings = readSyncSettings();
  const nextSettings = applySyncSettingsPatch(currentSettings, patch);
  const persistedSettings = persistSyncSettings(nextSettings);

  restartSchedulers(persistedSettings);
  return persistedSettings;
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

function repoStatus(payload) {
  const settings = readSyncSettings();
  let repoPath = settings.repoPath;

  if (payload !== undefined && payload !== null) {
    if (typeof payload === 'string') {
      repoPath = buildRepoPathForBaseFolder(payload, settings.repoFolderName);
    } else {
      const body = ensurePlainObject(payload, 'payload');
      if (body.baseFolderPath !== undefined) {
        repoPath = buildRepoPathForBaseFolder(body.baseFolderPath, settings.repoFolderName);
      }
    }
  }

  if (!repoPath) {
    return {
      exists: false,
      repoPath: null,
    };
  }

  const exists = syncModel.repoExists(repoPath);
  if (!exists) {
    return {
      exists: false,
      repoPath,
    };
  }

  const repoMeta = syncModel.attachRepo(repoPath);
  return {
    exists: true,
    repoPath,
    repoMeta,
  };
}

async function enableCreateRepo(payload) {
  const currentSettings = readSyncSettings();
  if (currentSettings.enabled) {
    throw new Error('Disable sync before creating a new repository.');
  }

  const { baseFolderPath, deviceName } = extractEnablePayload(payload, { allowDeviceName: true });
  const repoPath = buildRepoPathForBaseFolder(baseFolderPath, currentSettings.repoFolderName);

  return runSyncTask(async () => {
    setRunningState();
    try {
      const nextSettings = normalizeSettingsFromStore({
        ...cloneSettings(currentSettings),
        enabled: true,
        baseFolderPath: ensureBaseFolderPath(baseFolderPath),
        repoFolderName: currentSettings.repoFolderName,
        repoPath,
        deviceName: deviceName ?? currentSettings.deviceName,
        lastSeenRemoteSnapshotId: null,
        lastPublishedLocalCounter: null,
      });

      const repoMeta = syncModel.initRepo(nextSettings.repoPath, nextSettings.deviceId, nextSettings.deviceName);
      await performPush(nextSettings, { requireEnabled: false });
      const persistedSettings = readSyncSettings();
      restartSchedulers(persistedSettings);

      return {
        repoId: repoMeta.repoId,
        repoPath: repoMeta.repoPath,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setErrorState(errorMessage);
      throw error;
    }
  });
}

async function enableAttachRepo(payload) {
  const currentSettings = readSyncSettings();
  if (currentSettings.enabled) {
    throw new Error('Disable sync before attaching to a repository.');
  }

  const { baseFolderPath } = extractEnablePayload(payload);
  const normalizedBaseFolderPath = ensureBaseFolderPath(baseFolderPath);
  const repoPath = buildRepoPathForBaseFolder(normalizedBaseFolderPath, currentSettings.repoFolderName);

  return runSyncTask(async () => {
    setRunningState();
    try {
      const nextSettings = normalizeSettingsFromStore({
        ...cloneSettings(currentSettings),
        enabled: true,
        baseFolderPath: normalizedBaseFolderPath,
        repoFolderName: currentSettings.repoFolderName,
        repoPath,
      });

      const repoMeta = syncModel.attachRepo(nextSettings.repoPath);
      const pullResult = await performPull(nextSettings, {
        requireEnabled: false,
        resolveConflictWithRemote: true,
        preferRemoteWhenCounterUnknown: true,
      });
      const persistedSettings = readSyncSettings();
      restartSchedulers(persistedSettings);

      return {
        repoId: repoMeta.repoId,
        repoPath: repoMeta.repoPath,
        actionTaken:
          pullResult.action === 'pulled' ? 'pulled' : pullResult.action === 'conflict' ? 'conflict' : 'kept_local',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setErrorState(errorMessage);
      throw error;
    }
  });
}

async function disableSync() {
  return runSyncTask(async () => {
    clearSchedulers();

    const currentSettings = readSyncSettings();
    persistSyncSettings({
      ...cloneSettings(currentSettings),
      enabled: false,
    });

    setRuntimeState({
      status: 'idle',
      lastError: null,
      conflictInfo: null,
    });

    return {
      ok: true,
    };
  });
}

async function syncNow() {
  return runSyncTask(async () => {
    const settings = readSyncSettings();

    setRunningState();
    const pullResult = await performPull(settings);
    if (pullResult.action === 'conflict') {
      return {
        pulled: false,
        pushed: false,
        skipped: true,
        pullResult,
        pushResult: {
          action: 'skipped',
          reason: 'Push skipped because a sync conflict was detected.',
        },
      };
    }

    setRunningState();
    const pushResult = await performPush(readSyncSettings());

    return {
      pulled: pullResult.action === 'pulled',
      pushed: pushResult.action === 'pushed',
      skipped: pullResult.action !== 'pulled' && pushResult.action !== 'pushed',
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

function listSnapshots() {
  const settings = readSyncSettings();
  if (!settings.repoPath) {
    throw new Error('Sync repository is not configured.');
  }

  return syncModel.listAllSnapshots(settings.repoPath);
}

async function onAppBeforeQuit() {
  clearSchedulers();
  await waitForRunningSync();

  const settings = readSyncSettings();
  if (!settings.enabled || !settings.autoPushOnQuit || !settings.repoPath) {
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
  disableSync,
  dispose,
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
