const { app, shell } = require('electron');
const semver = require('semver');
const { appMetaModel } = require('../models');
const { isAllowedExternalUrl, openExternalIfAllowed } = require('../utils/external-url');
const { ensurePlainObject } = require('./utils');

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FETCH_TIMEOUT_MS = 10 * 1000;

function getOwnerRepo() {
  try {
    const pkg = require('../../package.json');
    const url = pkg.repository?.url ?? '';
    const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (match) return { owner: match[1], repo: match[2] };
  } catch (_) {}
  return null;
}

function shouldSkipCheck() {
  const row = appMetaModel.getByKey('lastUpdateCheck');
  if (!row?.value) return false;
  return Date.now() - parseInt(row.value, 10) < CHECK_INTERVAL_MS;
}

function saveLastCheckTimestamp() {
  const existing = appMetaModel.getByKey('lastUpdateCheck');
  if (!existing) {
    appMetaModel.create({ key: 'lastUpdateCheck', value: String(Date.now()) });
  } else {
    appMetaModel.updateByKey('lastUpdateCheck', { value: String(Date.now()) });
  }
}

async function fetchLatestRelease() {
  const ownerRepo = getOwnerRepo();
  if (!ownerRepo) return null;

  const { owner, repo } = ownerRepo;
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'boring-balance-app' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) return null;

  const data = await response.json();
  return {
    tagName: data.tag_name ?? null,
    // The link is shown to the user and opened on click, so it must be one the app would open.
    htmlUrl: isAllowedExternalUrl(data.html_url) ? data.html_url : null,
  };
}

function buildResult({
  updateAvailable,
  currentVersion,
  latestVersion,
  releaseUrl,
  popupDismissedForThisVersion,
}) {
  return {
    updateAvailable,
    currentVersion,
    latestVersion,
    releaseUrl,
    popupDismissedForThisVersion,
  };
}

function errorResult(currentVersion) {
  return buildResult({
    updateAvailable: false,
    currentVersion,
    latestVersion: null,
    releaseUrl: null,
    popupDismissedForThisVersion: false,
  });
}

async function performCheck(currentVersion) {
  const release = await fetchLatestRelease();
  if (!release?.tagName) return errorResult(currentVersion);

  const latestVersion = release.tagName.replace(/^v/, '');
  const normalizedLatest = semver.valid(latestVersion);
  if (!normalizedLatest) return errorResult(currentVersion);

  const updateAvailable = semver.gt(normalizedLatest, currentVersion);

  const ignoredRow = appMetaModel.getByKey('ignoredUpdateVersion');
  const ignoredVersion = ignoredRow?.value ?? null;
  const popupDismissedForThisVersion = ignoredVersion === normalizedLatest;

  return buildResult({
    updateAvailable,
    currentVersion,
    latestVersion: normalizedLatest,
    releaseUrl: release.htmlUrl,
    popupDismissedForThisVersion,
  });
}

async function check() {
  const currentVersion = app.getVersion();
  if (shouldSkipCheck()) {
    return buildResult({
      updateAvailable: false,
      currentVersion,
      latestVersion: null,
      releaseUrl: null,
      popupDismissedForThisVersion: false,
    });
  }

  try {
    const result = await performCheck(currentVersion);
    saveLastCheckTimestamp();
    return result;
  } catch (_) {
    return errorResult(currentVersion);
  }
}

async function forceCheck() {
  const currentVersion = app.getVersion();
  try {
    const result = await performCheck(currentVersion);
    saveLastCheckTimestamp();
    return result;
  } catch (_) {
    return errorResult(currentVersion);
  }
}

async function openRelease(payload) {
  const opened = await openExternalIfAllowed(payload?.url, (url) => shell.openExternal(url));
  if (!opened) {
    console.warn('[electron] Refused to open a link outside the allowed list.');
  }
}

function ignoreVersion(payload) {
  if (payload === undefined || payload === null) return;

  const body = ensurePlainObject(payload, 'payload');
  if (body.version === undefined || body.version === null || body.version === '') return;

  // Stored in the form the update check compares against, so only a valid semver string qualifies.
  const version = semver.valid(body.version);
  if (!version) {
    throw new Error('version must be a valid version string.');
  }

  const existing = appMetaModel.getByKey('ignoredUpdateVersion');
  if (!existing) {
    appMetaModel.create({ key: 'ignoredUpdateVersion', value: version });
  } else {
    appMetaModel.updateByKey('ignoredUpdateVersion', { value: version });
  }
}

module.exports = {
  check,
  forceCheck,
  openRelease,
  ignoreVersion,
};
