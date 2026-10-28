// Allow-list for links the app hands to the operating system (shell.openExternal). The renderer is
// not trusted with this call: any script that runs in it could otherwise open file://, smb:// or
// custom-protocol URLs.

const GITHUB_HOST = 'github.com';
const GITHUB_REPOSITORY_SEGMENTS = ['tratt0re', 'boring_balance'];
const WEBSITE_HOST = 'boringbalance.com';

function parseHttpsUrl(value) {
  if (typeof value !== 'string') {
    return null;
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  // The WHATWG parser lowercases the host, drops the default port, decodes dot segments (including
  // %2e and backslashes) and converts lookalike characters, so every check below runs on its output.
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') {
    return null;
  }

  return url;
}

function isInsideRepository(url) {
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  return GITHUB_REPOSITORY_SEGMENTS.every(
    (expected, index) => segments[index]?.toLowerCase() === expected,
  );
}

/**
 * True for https URLs under https://github.com/Tratt0re/boring_balance/ and anywhere on
 * https://boringbalance.com (no subdomains, no credentials, no custom port).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isAllowedExternalUrl(value) {
  const url = parseHttpsUrl(value);
  if (!url) {
    return false;
  }

  if (url.hostname === WEBSITE_HOST) {
    return true;
  }

  return url.hostname === GITHUB_HOST && isInsideRepository(url);
}

/**
 * Opens the URL with `open` only when it is allowed. The URL that was checked is the URL that is
 * opened: the parser's normalized form, never the caller's original string.
 *
 * @param {unknown} value
 * @param {(url: string) => Promise<unknown>} open
 * @returns {Promise<boolean>} Whether the URL was opened.
 */
async function openExternalIfAllowed(value, open) {
  if (!isAllowedExternalUrl(value)) {
    return false;
  }

  await open(new URL(value.trim()).href);
  return true;
}

module.exports = {
  isAllowedExternalUrl,
  openExternalIfAllowed,
};
