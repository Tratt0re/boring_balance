// Remembers the one file the user picked in a native dialog, so a later request from the renderer can
// be checked against it. The renderer is not trusted to name arbitrary files: a request that carries a
// path nobody picked is refused instead of reading or overwriting whatever that path points to.

const path = require('node:path');

function normalizeFilePath(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  return path.resolve(value.trim());
}

function createAuthorizedPath() {
  let authorizedPath = null;

  return {
    /** Remembers the picked file, or forgets the previous one when nothing was picked. */
    authorize(filePath) {
      authorizedPath = normalizeFilePath(filePath);
      return authorizedPath;
    },

    isAuthorized(filePath) {
      const candidate = normalizeFilePath(filePath);
      return candidate !== null && candidate === authorizedPath;
    },

    revoke() {
      authorizedPath = null;
    },
  };
}

/** True when `filePath` is a direct child of `folderPath` (never the folder itself, never deeper). */
function isDirectChildOf(folderPath, filePath) {
  const folder = normalizeFilePath(folderPath);
  const file = normalizeFilePath(filePath);
  if (!folder || !file) {
    return false;
  }

  return path.dirname(file) === folder && file !== folder;
}

module.exports = {
  createAuthorizedPath,
  isDirectChildOf,
  normalizeFilePath,
};
