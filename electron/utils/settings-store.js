const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { safeWriteFileAtomic } = require('./file-utils');
const { isPlainObject } = require('./object-utils');

const SETTINGS_FILE_NAME = 'settings.json';

function ensureSectionKey(sectionKey) {
  if (typeof sectionKey !== 'string' || sectionKey.trim().length === 0) {
    throw new Error('sectionKey must be a non-empty string.');
  }

  return sectionKey.trim();
}

function getSettingsFilePath() {
  const userDataPath = app.getPath('userData');
  fs.mkdirSync(userDataPath, { recursive: true });

  return path.join(userDataPath, SETTINGS_FILE_NAME);
}

// Set when settings.json was found damaged, so the app can tell the user instead of quietly starting
// from defaults. Cleared when acknowledged or when the settings are deliberately reset.
let settingsProblem = null;

function findFreeCorruptCopyPath(settingsFilePath) {
  const base = `${settingsFilePath}.corrupt-${Date.now()}`;
  let candidate = base;
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

/**
 * Moves a damaged settings file aside, keeping its content, so it is neither lost nor read again.
 * Returns true when the file is out of the way.
 */
function moveDamagedFileAside(settingsFilePath, reason) {
  try {
    const corruptCopyPath = findFreeCorruptCopyPath(settingsFilePath);
    fs.renameSync(settingsFilePath, corruptCopyPath);
    settingsProblem = { at: Date.now(), corruptCopyPath, reason };
    console.error(
      `[electron] settings.json was damaged; kept as ${path.basename(corruptCopyPath)} and started from defaults.`,
      reason,
    );
    return true;
  } catch (error) {
    settingsProblem = { at: Date.now(), corruptCopyPath: null, reason };
    console.error(
      `[electron] settings.json is damaged (${reason}) and could not be moved aside:`,
      error,
    );
    return false;
  }
}

/** Reads the store. A damaged file is moved aside; a write refuses to continue if that fails. */
function readSettingsStore({ forWrite = false } = {}) {
  const settingsFilePath = getSettingsFilePath();
  if (!fs.existsSync(settingsFilePath)) {
    return {};
  }

  let reason;
  try {
    const rawValue = fs.readFileSync(settingsFilePath, 'utf8').trim();
    if (!rawValue) {
      return {};
    }

    const parsedValue = JSON.parse(rawValue);
    if (isPlainObject(parsedValue)) {
      return parsedValue;
    }

    reason = 'it does not contain a settings object';
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
  }

  if (!moveDamagedFileAside(settingsFilePath, reason) && forWrite) {
    throw new Error(
      'settings.json is damaged and could not be moved aside, so it was not overwritten.',
    );
  }

  return {};
}

function getSettingsProblem() {
  return settingsProblem;
}

function acknowledgeSettingsProblem() {
  settingsProblem = null;
}

function writeSettingsStore(value) {
  if (!isPlainObject(value)) {
    throw new Error('Settings payload must be a plain object.');
  }

  const settingsFilePath = getSettingsFilePath();
  safeWriteFileAtomic(settingsFilePath, JSON.stringify(value, null, 2));
}

function clearSettingsStore() {
  settingsProblem = null;
  const settingsFilePath = getSettingsFilePath();
  if (!fs.existsSync(settingsFilePath)) {
    return;
  }

  fs.rmSync(settingsFilePath, { force: true });
}

function normalizeSectionValue(sectionValue, defaults = {}) {
  const normalizedDefaults = isPlainObject(defaults) ? defaults : {};
  const normalizedSectionValue = isPlainObject(sectionValue) ? sectionValue : {};

  return {
    ...normalizedDefaults,
    ...normalizedSectionValue,
  };
}

function getSettingsSection(sectionKey, defaults = {}) {
  const normalizedSectionKey = ensureSectionKey(sectionKey);
  const settingsStore = readSettingsStore();

  return normalizeSectionValue(settingsStore[normalizedSectionKey], defaults);
}

function setSettingsSection(sectionKey, sectionValue) {
  const normalizedSectionKey = ensureSectionKey(sectionKey);
  const normalizedSectionValue = normalizeSectionValue(sectionValue);
  const settingsStore = readSettingsStore({ forWrite: true });

  settingsStore[normalizedSectionKey] = normalizedSectionValue;
  writeSettingsStore(settingsStore);

  return normalizedSectionValue;
}

function patchSettingsSection(sectionKey, patchValue, defaults = {}) {
  if (!isPlainObject(patchValue)) {
    throw new Error('patchValue must be a plain object.');
  }

  const normalizedSectionKey = ensureSectionKey(sectionKey);
  const settingsStore = readSettingsStore({ forWrite: true });
  const currentSection = normalizeSectionValue(settingsStore[normalizedSectionKey], defaults);
  const nextSection = {
    ...currentSection,
    ...Object.fromEntries(Object.entries(patchValue).filter(([, value]) => value !== undefined)),
  };

  settingsStore[normalizedSectionKey] = nextSection;
  writeSettingsStore(settingsStore);

  return nextSection;
}

module.exports = {
  acknowledgeSettingsProblem,
  clearSettingsStore,
  getSettingsFilePath,
  getSettingsProblem,
  getSettingsSection,
  patchSettingsSection,
  setSettingsSection,
};
