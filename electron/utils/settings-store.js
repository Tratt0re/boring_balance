const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { safeWriteFileAtomic } = require('./file-utils');

const SETTINGS_FILE_NAME = 'settings.json';

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

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

function readSettingsStore() {
  const settingsFilePath = getSettingsFilePath();
  if (!fs.existsSync(settingsFilePath)) {
    return {};
  }

  try {
    const rawValue = fs.readFileSync(settingsFilePath, 'utf8').trim();
    if (!rawValue) {
      return {};
    }

    const parsedValue = JSON.parse(rawValue);
    return isPlainObject(parsedValue) ? parsedValue : {};
  } catch {
    return {};
  }
}

function writeSettingsStore(value) {
  if (!isPlainObject(value)) {
    throw new Error('Settings payload must be a plain object.');
  }

  const settingsFilePath = getSettingsFilePath();
  safeWriteFileAtomic(settingsFilePath, JSON.stringify(value, null, 2));
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
  const settingsStore = readSettingsStore();

  settingsStore[normalizedSectionKey] = normalizedSectionValue;
  writeSettingsStore(settingsStore);

  return normalizedSectionValue;
}

function patchSettingsSection(sectionKey, patchValue, defaults = {}) {
  if (!isPlainObject(patchValue)) {
    throw new Error('patchValue must be a plain object.');
  }

  const normalizedSectionKey = ensureSectionKey(sectionKey);
  const settingsStore = readSettingsStore();
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
  getSettingsFilePath,
  getSettingsSection,
  patchSettingsSection,
  setSettingsSection,
};
