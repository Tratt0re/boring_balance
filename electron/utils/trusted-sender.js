// Checks who is talking to the main process. The IPC handlers can read and overwrite all of the user's
// financial data, so they only answer the app's own page, in its top-level frame. Any other page
// (a navigation that slipped through, an iframe, injected content on a foreign origin) is refused.
// Permission prompts (camera, microphone, location, notifications...) are never granted: the app
// uses none of them.

const { pathToFileURL } = require('node:url');

function parseUrl(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isInsideDirectory(url, directory) {
  if (url.protocol !== 'file:' || url.hostname !== '') {
    return false;
  }

  // Both sides go through the URL parser, so ".." and %2e%2e are resolved before they are compared.
  // pathToFileURL also copes with Windows drive letters and with spaces in the install path.
  const basePath = pathToFileURL(directory).pathname.replace(/\/+$/, '');
  return url.pathname === basePath || url.pathname.startsWith(`${basePath}/`);
}

function isDevServerUrl(url, devServerUrl) {
  const dev = parseUrl(devServerUrl);
  if (!dev || (dev.protocol !== 'http:' && dev.protocol !== 'https:')) {
    return false;
  }

  return url.origin === dev.origin && url.username === '' && url.password === '';
}

/**
 * @param {unknown} value URL reported by the sender.
 * @param {{ rendererDir?: string|null, devServerUrl?: string|null }} [options]
 * @returns {boolean} True only for a page of this app: a file inside the built renderer directory,
 *   or, in development, the dev server.
 */
function isTrustedAppUrl(value, options = {}) {
  const url = parseUrl(value);
  if (!url) {
    return false;
  }

  const { rendererDir, devServerUrl } = options ?? {};
  if (
    typeof rendererDir === 'string' &&
    rendererDir.length > 0 &&
    isInsideDirectory(url, rendererDir)
  ) {
    return true;
  }

  return typeof devServerUrl === 'string' && isDevServerUrl(url, devServerUrl);
}

/**
 * @param {{ rendererDir?: string|null, devServerUrl?: string|null,
 *   onRefused?: (info: { channel: string, url: string|null }) => void }} [options]
 */
function createSenderValidator(options = {}) {
  function isTrusted(event) {
    const frame = event?.senderFrame;
    if (!frame || typeof frame.url !== 'string') {
      return false;
    }

    // Only the top-level frame. A sub-frame can show an app URL while hosting something else.
    if (frame !== event.sender?.mainFrame) {
      return false;
    }

    return isTrustedAppUrl(frame.url, options);
  }

  function wrap(channel, handler) {
    return async (event, ...args) => {
      if (!isTrusted(event)) {
        options.onRefused?.({ channel, url: event?.senderFrame?.url ?? null });
        throw new Error(`IPC call to "${channel}" is not allowed from this page.`);
      }

      return handler(...args);
    };
  }

  return { isTrusted, wrap };
}

/** Denies every permission request and check on the session. */
function installPermissionPolicy(session) {
  if (
    !session ||
    typeof session.setPermissionRequestHandler !== 'function' ||
    typeof session.setPermissionCheckHandler !== 'function'
  ) {
    throw new Error('installPermissionPolicy needs an Electron session.');
  }

  session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.setPermissionCheckHandler(() => false);
}

module.exports = {
  createSenderValidator,
  installPermissionPolicy,
  isTrustedAppUrl,
};
