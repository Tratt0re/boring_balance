const { app, dialog } = require('electron');
const path = require('node:path');
const {
  closeDatabase,
  createDatabase,
  getDatabase,
  getDatabasePath,
  runMigrations,
} = require('../database');
const { backupModel } = require('../models');
const { broadcastIpcEvent } = require('../ipc/broadcast');
const { restoreReplacedFile } = require('../utils/file-utils');
const { runExclusive } = require('../utils/operation-lock');
const { getSettingsSection, setSettingsSection } = require('../utils/settings-store');
const {
  createAuthorizedPath,
  isDirectChildOf,
  normalizeFilePath,
} = require('../utils/authorized-path');
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
const BACKUP_ALLOWED_INTERVAL_OPTIONS = new Set([0, 30, 60, 120]);
const BACKUP_ALLOWED_RETENTION_OPTIONS = new Set([1, 2, 3, 4, 5]);
const BACKUP_SETTINGS_DEFAULTS = Object.freeze({
  enabled: false,
  folderPath: null,
  autoBackupOnQuit: true,
  autoBackupIntervalMin: 0,
  retentionCount: 1,
});
const BACKUP_STATE_DEFAULTS = Object.freeze({
  lastBackupAtMs: null,
  lastBackupFileName: null,
  lastBackupStatus: 'idle',
  lastBackupError: null,
  lastCleanupWarning: null,
  lastBackedUpChangeCounter: null,
});
const BACKUP_EVENT_CHANNELS = Object.freeze({
  stateChanged: 'backup:stateChanged',
  backupCompleted: 'backup:backupCompleted',
  backupFailed: 'backup:backupFailed',
  restoreCompleted: 'backup:restoreCompleted',
  restoreFailed: 'backup:restoreFailed',
});

// The one file the user picked for a restore. The renderer may name any path in a request, so a path
// that is neither this file nor a backup in the configured folder is refused.
const pickedRestoreFile = createAuthorizedPath();
const pickedBackupFolder = createAuthorizedPath();

let schedulerTimer = null;
let runningBackupPromise = null;
let initialized = false;
let runtimeState = {
  ...BACKUP_STATE_DEFAULTS,
};

function normalizeAutoBackupIntervalOption(value, label) {
  const normalizedValue = normalizeNonNegativeInteger(value, label);
  if (!BACKUP_ALLOWED_INTERVAL_OPTIONS.has(normalizedValue)) {
    throw new Error(`${label} must be one of: 0, 30, 60, 120.`);
  }

  return normalizedValue;
}

function normalizeRetentionCountOption(value, label) {
  const normalizedValue = normalizePositiveInteger(value, label);
  if (!BACKUP_ALLOWED_RETENTION_OPTIONS.has(normalizedValue)) {
    throw new Error(`${label} must be one of: 1, 2, 3, 4, 5.`);
  }

  return normalizedValue;
}

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
    lastCleanupWarning: runtimeState.lastCleanupWarning,
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
      normalizedSettings.enabled =
        normalizeBooleanFlag(storedValue.enabled, 'settings.enabled') === 1;
    }
  } catch {
    normalizedSettings.enabled = BACKUP_SETTINGS_DEFAULTS.enabled;
  }

  try {
    if (storedValue.folderPath !== undefined) {
      normalizedSettings.folderPath =
        normalizeOptionalString(storedValue.folderPath, 'settings.folderPath', {
          allowNull: true,
        }) ?? null;
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
      normalizedSettings.autoBackupIntervalMin = normalizeAutoBackupIntervalOption(
        storedValue.autoBackupIntervalMin,
        'settings.autoBackupIntervalMin',
      );
    }
  } catch {
    normalizedSettings.autoBackupIntervalMin = BACKUP_SETTINGS_DEFAULTS.autoBackupIntervalMin;
  }

  try {
    if (storedValue.retentionCount !== undefined) {
      normalizedSettings.retentionCount = normalizeRetentionCountOption(
        storedValue.retentionCount,
        'settings.retentionCount',
      );
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

// The renderer may only point backups at the folder the user chose in the folder dialog, or keep the
// one already saved. Clearing the folder is always allowed.
function assertBackupFolderAllowed(folderPath, savedFolderPath) {
  if (folderPath === null || pickedBackupFolder.isAuthorized(folderPath)) {
    return;
  }

  if (savedFolderPath && normalizeFilePath(folderPath) === normalizeFilePath(savedFolderPath)) {
    return;
  }

  throw new Error('Choose the backup folder with the folder picker.');
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
    assertBackupFolderAllowed(nextSettings.folderPath, currentSettings.folderPath);
  }

  if (patch.autoBackupOnQuit !== undefined) {
    nextSettings.autoBackupOnQuit =
      normalizeBooleanFlag(patch.autoBackupOnQuit, 'payload.autoBackupOnQuit') === 1;
  }

  if (patch.autoBackupIntervalMin !== undefined) {
    nextSettings.autoBackupIntervalMin = normalizeAutoBackupIntervalOption(
      patch.autoBackupIntervalMin,
      'payload.autoBackupIntervalMin',
    );
  }

  if (patch.retentionCount !== undefined) {
    nextSettings.retentionCount = normalizeRetentionCountOption(
      patch.retentionCount,
      'payload.retentionCount',
    );
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

  schedulerTimer = setInterval(
    () => {
      void runAutomaticBackup('interval').catch((error) => {
        console.error('[electron] Scheduled backup failed:', error);
      });
    },
    settings.autoBackupIntervalMin * 60 * 1000,
  );
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
      options.currentChangeCounter === undefined
        ? readCurrentChangeCounter()
        : options.currentChangeCounter;
    if (!hasChangesSinceLastBackup(currentChangeCounter)) {
      return null;
    }
  }

  setRuntimeState({
    lastBackupStatus: 'running',
    lastBackupError: null,
  });

  try {
    const backupResult = await backupModel.createBackup(
      getDatabase(),
      settings.folderPath,
      app.getVersion(),
    );

    // The new backup is already good. A failure to remove old ones is only a warning about cleanup.
    let cleanupWarning = null;
    try {
      backupModel.pruneBackups(settings.folderPath, settings.retentionCount);
    } catch (pruneError) {
      cleanupWarning = pruneError instanceof Error ? pruneError.message : String(pruneError);
      console.error('[electron] Could not remove old backups:', pruneError);
    }

    setRuntimeState({
      lastBackupAtMs: backupResult.createdAtMs,
      lastBackupFileName: backupResult.fileName,
      lastBackupStatus: 'ok',
      lastBackupError: null,
      lastCleanupWarning: cleanupWarning,
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

  runningBackupPromise = runExclusive('backup', () => executeBackup(options)).finally(() => {
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

  const folderPath = result.canceled ? null : (result.filePaths[0] ?? null);
  if (!pickedBackupFolder.authorize(folderPath)) {
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

async function selectRestoreFile() {
  const result = await dialog.showOpenDialog({
    title: 'Select a backup to restore',
    properties: ['openFile'],
  });

  const filePath = result.canceled ? null : (result.filePaths[0] ?? null);
  const authorizedPath = pickedRestoreFile.authorize(filePath);
  if (!authorizedPath) {
    return null;
  }

  return { filePath: authorizedPath, fileName: path.basename(authorizedPath) };
}

function isBackupInConfiguredFolder(backupFilePath) {
  const { folderPath } = readBackupSettings();
  if (!folderPath || !isDirectChildOf(folderPath, backupFilePath)) {
    return false;
  }

  const fileName = path.basename(backupFilePath);
  return (
    fileName.startsWith(backupModel.BACKUP_FILE_PREFIX) &&
    fileName.endsWith(backupModel.SQLITE_FILE_SUFFIX)
  );
}

function assertRestoreSourceAllowed(backupFilePath) {
  if (
    pickedRestoreFile.isAuthorized(backupFilePath) ||
    isBackupInConfiguredFolder(backupFilePath)
  ) {
    return;
  }

  throw new Error(
    'This file was not chosen with the file picker and is not a backup in the configured backup folder.',
  );
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
  assertRestoreSourceAllowed(backupFilePath);

  return runExclusive('restore', async () => {
    // Refuse a file that is not a healthy backup while the live database is still open and untouched.
    backupModel.assertUsableDatabaseFile(path.resolve(backupFilePath));

    // A picked file is good for one restore. Asking again means picking it again.
    pickedRestoreFile.revoke();
    const localDbPath = getDatabasePath();

    let restoreResult = null;

    try {
      closeDatabase();
      restoreResult = backupModel.restoreBackup(backupFilePath, localDbPath);
      const database = createDatabase();
      runMigrations(database);

      broadcastIpcEvent(BACKUP_EVENT_CHANNELS.restoreCompleted, restoreResult);
      return restoreResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      broadcastIpcEvent(BACKUP_EVENT_CHANNELS.restoreFailed, { error: errorMessage });

      // The restored file could not be opened: put the user's previous database back, then reopen it.
      closeDatabase();
      if (restoreResult) {
        try {
          restoreReplacedFile(localDbPath, restoreResult.previousLocalCopyPath);
        } catch (rollbackError) {
          console.error('[electron] Failed to put the previous database back:', rollbackError);
        }
      }

      try {
        const database = createDatabase();
        runMigrations(database);
      } catch (reopenError) {
        console.error('[electron] Failed to reopen database after restore error:', reopenError);
      }

      throw error;
    }
  });
}

function remove(payload) {
  const backupFilePath = extractString(payload, 'backupFilePath');
  const settings = readBackupSettings();
  if (!settings.folderPath) {
    throw new Error('Backup folder path is not configured.');
  }

  const normalizedBackupFilePath = path.resolve(backupFilePath);
  const normalizedFolderPath = path.resolve(settings.folderPath);
  const relativeBackupPath = path.relative(normalizedFolderPath, normalizedBackupFilePath);
  if (relativeBackupPath.startsWith('..') || path.isAbsolute(relativeBackupPath)) {
    throw new Error('Backup file must be inside the configured backup folder.');
  }

  const backupFileName = path.basename(normalizedBackupFilePath);
  if (
    !backupFileName.startsWith(backupModel.BACKUP_FILE_PREFIX) ||
    !backupFileName.endsWith(backupModel.SQLITE_FILE_SUFFIX)
  ) {
    throw new Error('Invalid backup file name.');
  }

  return backupModel.removeBackup(normalizedBackupFilePath);
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
  remove,
  restore,
  runNow,
  selectFolder,
  selectRestoreFile,
  updateSettings,
};
