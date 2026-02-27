const { app, dialog } = require('electron');
const {
  closeDatabase,
  createDatabase,
  getDatabase,
  getDatabasePath,
  runMigrations,
} = require('../database');
const { backupModel } = require('../models');
const { broadcastIpcEvent } = require('../ipc/broadcast');
const { getSettingsSection, setSettingsSection } = require('../utils/settings-store');
const {
  assertAllowedKeys,
  ensureNonEmptyObject,
  normalizeBooleanFlag,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  normalizePositiveInteger,
  extractString,
} = require('./utils');

const BACKUP_SETTINGS_SECTION_KEY = 'backup';
const BACKUP_SETTINGS_FIELDS = new Set([
  'enabled',
  'folderPath',
  'autoBackupOnQuit',
  'autoBackupIntervalMin',
  'retentionCount',
]);
const BACKUP_SETTINGS_DEFAULTS = Object.freeze({
  enabled: false,
  folderPath: null,
  autoBackupOnQuit: true,
  autoBackupIntervalMin: 30,
  retentionCount: 20,
});
const BACKUP_STATE_DEFAULTS = Object.freeze({
  lastBackupAtMs: null,
  lastBackupFileName: null,
  lastBackupStatus: 'idle',
  lastBackupError: null,
  lastBackedUpChangeCounter: null,
});
const BACKUP_EVENT_CHANNELS = Object.freeze({
  stateChanged: 'backup:stateChanged',
  backupCompleted: 'backup:backupCompleted',
  backupFailed: 'backup:backupFailed',
  restoreCompleted: 'backup:restoreCompleted',
  restoreFailed: 'backup:restoreFailed',
});

let schedulerTimer = null;
let runningBackupPromise = null;
let restoreInProgress = false;
let initialized = false;
let runtimeState = {
  ...BACKUP_STATE_DEFAULTS,
};

function cloneSettings(settings) {
  return {
    enabled: settings.enabled,
    folderPath: settings.folderPath,
    autoBackupOnQuit: settings.autoBackupOnQuit,
    autoBackupIntervalMin: settings.autoBackupIntervalMin,
    retentionCount: settings.retentionCount,
  };
}

function cloneState() {
  return {
    lastBackupAtMs: runtimeState.lastBackupAtMs,
    lastBackupFileName: runtimeState.lastBackupFileName,
    lastBackupStatus: runtimeState.lastBackupStatus,
    lastBackupError: runtimeState.lastBackupError,
    lastBackedUpChangeCounter: runtimeState.lastBackedUpChangeCounter,
  };
}

function broadcastStateChanged() {
  broadcastIpcEvent(BACKUP_EVENT_CHANNELS.stateChanged, cloneState());
}

function setRuntimeState(patch) {
  runtimeState = {
    ...runtimeState,
    ...patch,
  };

  broadcastStateChanged();
}

function normalizeSettingsFromStore(value) {
  const storedValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalizedSettings = {
    ...BACKUP_SETTINGS_DEFAULTS,
  };

  try {
    if (storedValue.enabled !== undefined) {
      normalizedSettings.enabled = normalizeBooleanFlag(storedValue.enabled, 'settings.enabled') === 1;
    }
  } catch {
    normalizedSettings.enabled = BACKUP_SETTINGS_DEFAULTS.enabled;
  }

  try {
    if (storedValue.folderPath !== undefined) {
      normalizedSettings.folderPath =
        normalizeOptionalString(storedValue.folderPath, 'settings.folderPath', { allowNull: true }) ?? null;
    }
  } catch {
    normalizedSettings.folderPath = BACKUP_SETTINGS_DEFAULTS.folderPath;
  }

  try {
    if (storedValue.autoBackupOnQuit !== undefined) {
      normalizedSettings.autoBackupOnQuit =
        normalizeBooleanFlag(storedValue.autoBackupOnQuit, 'settings.autoBackupOnQuit') === 1;
    }
  } catch {
    normalizedSettings.autoBackupOnQuit = BACKUP_SETTINGS_DEFAULTS.autoBackupOnQuit;
  }

  try {
    if (storedValue.autoBackupIntervalMin !== undefined) {
      normalizedSettings.autoBackupIntervalMin = normalizeNonNegativeInteger(
        storedValue.autoBackupIntervalMin,
        'settings.autoBackupIntervalMin',
      );
    }
  } catch {
    normalizedSettings.autoBackupIntervalMin = BACKUP_SETTINGS_DEFAULTS.autoBackupIntervalMin;
  }

  try {
    if (storedValue.retentionCount !== undefined) {
      normalizedSettings.retentionCount = normalizePositiveInteger(storedValue.retentionCount, 'settings.retentionCount');
    }
  } catch {
    normalizedSettings.retentionCount = BACKUP_SETTINGS_DEFAULTS.retentionCount;
  }

  return normalizedSettings;
}

function readBackupSettings() {
  const storedSettings = getSettingsSection(BACKUP_SETTINGS_SECTION_KEY, BACKUP_SETTINGS_DEFAULTS);
  const normalizedSettings = normalizeSettingsFromStore(storedSettings);
  const normalizedStoredSettings = JSON.stringify(normalizedSettings);
  const normalizedExpectedSettings = JSON.stringify(storedSettings);

  if (normalizedStoredSettings !== normalizedExpectedSettings) {
    setSettingsSection(BACKUP_SETTINGS_SECTION_KEY, normalizedSettings);
  }

  return normalizedSettings;
}

function persistBackupSettings(settings) {
  return setSettingsSection(BACKUP_SETTINGS_SECTION_KEY, cloneSettings(settings));
}

function applyBackupSettingsPatch(currentSettings, patch) {
  const nextSettings = {
    ...currentSettings,
  };

  if (patch.enabled !== undefined) {
    nextSettings.enabled = normalizeBooleanFlag(patch.enabled, 'payload.enabled') === 1;
  }

  if (patch.folderPath !== undefined) {
    nextSettings.folderPath =
      normalizeOptionalString(patch.folderPath, 'payload.folderPath', { allowNull: true }) ?? null;
  }

  if (patch.autoBackupOnQuit !== undefined) {
    nextSettings.autoBackupOnQuit = normalizeBooleanFlag(patch.autoBackupOnQuit, 'payload.autoBackupOnQuit') === 1;
  }

  if (patch.autoBackupIntervalMin !== undefined) {
    nextSettings.autoBackupIntervalMin = normalizeNonNegativeInteger(
      patch.autoBackupIntervalMin,
      'payload.autoBackupIntervalMin',
    );
  }

  if (patch.retentionCount !== undefined) {
    nextSettings.retentionCount = normalizePositiveInteger(patch.retentionCount, 'payload.retentionCount');
  }

  return nextSettings;
}

function clearScheduler() {
  if (!schedulerTimer) {
    return;
  }

  clearInterval(schedulerTimer);
  schedulerTimer = null;
}

function restartScheduler(settings = readBackupSettings()) {
  clearScheduler();

  if (!settings.enabled) {
    return;
  }

  if (settings.autoBackupIntervalMin <= 0) {
    return;
  }

  schedulerTimer = setInterval(() => {
    void runAutomaticBackup('interval').catch((error) => {
      console.error('[electron] Scheduled backup failed:', error);
    });
  }, settings.autoBackupIntervalMin * 60 * 1000);
}

function hasChangesSinceLastBackup(changeCounter) {
  if (!Number.isInteger(changeCounter)) {
    return true;
  }

  if (!Number.isInteger(runtimeState.lastBackedUpChangeCounter)) {
    return true;
  }

  return changeCounter > runtimeState.lastBackedUpChangeCounter;
}

function readCurrentChangeCounter() {
  const backupMeta = backupModel.readBackupMeta(getDatabase());
  return backupMeta.changeCounter;
}

async function executeBackup(options = {}) {
  const settings = options.settings ?? readBackupSettings();

  if (options.requireEnabled && !settings.enabled) {
    return null;
  }

  if (!settings.folderPath) {
    if (options.automatic) {
      return null;
    }

    throw new Error('Backup folder path is not configured.');
  }

  if (options.requireChangeCounterAdvance) {
    const currentChangeCounter =
      options.currentChangeCounter === undefined ? readCurrentChangeCounter() : options.currentChangeCounter;
    if (!hasChangesSinceLastBackup(currentChangeCounter)) {
      return null;
    }
  }

  setRuntimeState({
    lastBackupStatus: 'running',
    lastBackupError: null,
  });

  try {
    const backupResult = await backupModel.createBackup(getDatabase(), settings.folderPath, app.getVersion());
    backupModel.pruneBackups(settings.folderPath, settings.retentionCount);

    setRuntimeState({
      lastBackupAtMs: backupResult.createdAtMs,
      lastBackupFileName: backupResult.fileName,
      lastBackupStatus: 'ok',
      lastBackupError: null,
      lastBackedUpChangeCounter: Number.isInteger(backupResult.meta?.change_counter)
        ? backupResult.meta.change_counter
        : runtimeState.lastBackedUpChangeCounter,
    });

    broadcastIpcEvent(BACKUP_EVENT_CHANNELS.backupCompleted, backupResult);
    return backupResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    setRuntimeState({
      lastBackupStatus: 'error',
      lastBackupError: errorMessage,
    });

    broadcastIpcEvent(BACKUP_EVENT_CHANNELS.backupFailed, { error: errorMessage });
    throw error;
  }
}

function runBackup(options = {}) {
  if (runningBackupPromise) {
    return runningBackupPromise;
  }

  runningBackupPromise = executeBackup(options).finally(() => {
    runningBackupPromise = null;
  });

  return runningBackupPromise;
}

async function runAutomaticBackup(trigger) {
  const settings = readBackupSettings();
  if (!settings.enabled || !settings.folderPath) {
    return null;
  }

  return runBackup({
    automatic: true,
    trigger,
    requireEnabled: true,
    requireChangeCounterAdvance: true,
    settings,
  });
}

function init() {
  if (initialized) {
    return;
  }

  initialized = true;
  restartScheduler(readBackupSettings());
}

function dispose() {
  clearScheduler();
  initialized = false;
}

function getSettings() {
  return readBackupSettings();
}

function updateSettings(payload) {
  const patch = ensureNonEmptyObject(payload, 'payload');
  assertAllowedKeys(patch, BACKUP_SETTINGS_FIELDS, 'payload');

  const currentSettings = readBackupSettings();
  const nextSettings = applyBackupSettingsPatch(currentSettings, patch);
  const persistedSettings = normalizeSettingsFromStore(persistBackupSettings(nextSettings));

  restartScheduler(persistedSettings);
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

function list() {
  const settings = readBackupSettings();
  if (!settings.folderPath) {
    throw new Error('Backup folder path is not configured.');
  }

  return backupModel.listBackups(settings.folderPath);
}

async function runNow() {
  return runBackup({
    automatic: false,
    requireEnabled: false,
    requireChangeCounterAdvance: false,
  });
}

async function restore(payload) {
  const backupFilePath = extractString(payload, 'backupFilePath');
  if (runningBackupPromise) {
    throw new Error('Cannot restore while a backup operation is running.');
  }

  if (restoreInProgress) {
    throw new Error('A restore operation is already running.');
  }

  restoreInProgress = true;
  const localDbPath = getDatabasePath();

  try {
    closeDatabase();
    const restoreResult = backupModel.restoreBackup(backupFilePath, localDbPath);
    const database = createDatabase();
    runMigrations(database);

    broadcastIpcEvent(BACKUP_EVENT_CHANNELS.restoreCompleted, restoreResult);
    return restoreResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    broadcastIpcEvent(BACKUP_EVENT_CHANNELS.restoreFailed, { error: errorMessage });

    try {
      const database = createDatabase();
      runMigrations(database);
    } catch (reopenError) {
      console.error('[electron] Failed to reopen database after restore error:', reopenError);
    }

    throw error;
  } finally {
    restoreInProgress = false;
  }
}

async function onAppBeforeQuit() {
  const settings = readBackupSettings();
  if (!settings.enabled || !settings.autoBackupOnQuit || !settings.folderPath) {
    return null;
  }

  try {
    return await runBackup({
      automatic: true,
      trigger: 'before-quit',
      requireEnabled: true,
      requireChangeCounterAdvance: true,
      settings,
    });
  } catch (error) {
    console.error('[electron] Auto-backup on app quit failed:', error);
    return null;
  }
}

module.exports = {
  dispose,
  getSettings,
  getState,
  init,
  list,
  onAppBeforeQuit,
  restore,
  runNow,
  selectFolder,
  updateSettings,
};
