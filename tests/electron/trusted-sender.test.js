import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  createSenderValidator,
  installPermissionPolicy,
  isTrustedAppUrl,
} = require('../../electron/utils/trusted-sender.js');

const APP_DIR =
  '/Users/me/Applications/Boring Balance.app/Contents/Resources/app.asar/dist/boringbalance/browser';
const DEV_URL = 'http://localhost:4200';

const production = { rendererDir: APP_DIR, devServerUrl: null };
const development = { rendererDir: APP_DIR, devServerUrl: DEV_URL };

describe('isTrustedAppUrl in a packaged app', () => {
  it.each([
    [`file://${APP_DIR}/index.html`],
    [`file://${APP_DIR}/`],
    [`file://${APP_DIR}`],
    [`file://${APP_DIR}/accounts`],
    [`file://${APP_DIR}/settings/general`],
    [`file://${APP_DIR}/accounts/42?tab=detail#top`],
    [`file://${APP_DIR.replace(/ /g, '%20')}/transactions`],
  ])('accepts %s', (url) => {
    expect(isTrustedAppUrl(url, production)).toBe(true);
  });

  it.each([
    ['a file outside the app directory', 'file:///etc/passwd'],
    ['the parent directory', `file://${path.dirname(APP_DIR)}/index.html`],
    ['a sibling directory with the same prefix', `file://${APP_DIR}-evil/index.html`],
    ['a sibling whose name extends the last segment', `file://${APP_DIR}evil/index.html`],
    ['a dot-dot escape', `file://${APP_DIR}/../../../../etc/passwd`],
    ['an encoded dot-dot escape', `file://${APP_DIR}/%2e%2e/%2e%2e/secret.html`],
    ['a downloaded html file', 'file:///Users/me/Downloads/page.html'],
    ['a file on a network host', 'file://server/share/index.html'],
    ['a remote page', 'https://example.com/'],
    ['the project website', 'https://boringbalance.com/'],
    ['the dev server, which must not be trusted in production', `${DEV_URL}/`],
    // These carry the app directory as their path, so only the scheme and host checks refuse them.
    ['an https page whose path is the app directory', `https://example.com${APP_DIR}/index.html`],
    ['an http page whose path is the app directory', `http://localhost${APP_DIR}/index.html`],
    ['a custom scheme with no host and the app path', `custom://${APP_DIR}/index.html`],
    ['a data scheme with the app path', `data://${APP_DIR}/index.html`],
    ['a blob scheme with the app path', `blob://${APP_DIR}/index.html`],
    ['a file URL on another host with the app path', `file://server${APP_DIR}/index.html`],
    ['a file URL with credentials and the app path', `file://user@server${APP_DIR}/index.html`],
    ['a data URL', 'data:text/html,<script>1</script>'],
    ['about:blank', 'about:blank'],
    ['a blob URL', `blob:file://${APP_DIR}/1234`],
    ['an empty string', ''],
    ['not a URL', 'not a url'],
    ['a javascript URL', 'javascript:alert(1)'],
  ])('refuses %s', (_label, url) => {
    expect(isTrustedAppUrl(url, production)).toBe(false);
  });

  it.each([[undefined], [null], [42], [{}], [[`file://${APP_DIR}/index.html`]]])(
    'refuses a non-string %j',
    (value) => {
      expect(isTrustedAppUrl(value, production)).toBe(false);
    },
  );

  it('does not trust anything when no renderer directory is known', () => {
    expect(isTrustedAppUrl(`file://${APP_DIR}/index.html`, { rendererDir: null })).toBe(false);
    expect(isTrustedAppUrl(`file://${APP_DIR}/index.html`, {})).toBe(false);
    expect(isTrustedAppUrl(`file://${APP_DIR}/index.html`)).toBe(false);
  });
});

describe('isTrustedAppUrl in development', () => {
  it.each([
    [`${DEV_URL}/`],
    [`${DEV_URL}/accounts`],
    [`${DEV_URL}/settings/general?x=1#y`],
    [DEV_URL],
  ])('accepts the dev server page %s', (url) => {
    expect(isTrustedAppUrl(url, development)).toBe(true);
  });

  it('still accepts the built app, since a development run can load it too', () => {
    expect(isTrustedAppUrl(`file://${APP_DIR}/index.html`, development)).toBe(true);
  });

  it.each([
    ['another port', 'http://localhost:4201/'],
    ['another host', 'http://127.0.0.1:4200/'],
    ['a host that starts like it', 'http://localhost:4200.evil.com/'],
    ['a user-info trick', 'http://localhost:4200@evil.com/'],
    ['credentials on the real dev server', 'http://user:pw@localhost:4200/'],
    ['a port that extends the dev port', 'http://localhost:42001/'],
    ['https on the same host', 'https://localhost:4200/'],
    ['a remote page', 'https://example.com/'],
    ['a file outside the app', 'file:///etc/passwd'],
  ])('refuses %s', (_label, url) => {
    expect(isTrustedAppUrl(url, development)).toBe(false);
  });

  it('ignores a dev server URL that is not an http(s) URL', () => {
    expect(
      isTrustedAppUrl('file:///etc/passwd', { ...development, devServerUrl: 'file:///etc' }),
    ).toBe(false);
    expect(
      isTrustedAppUrl('http://localhost:4200/', { ...development, devServerUrl: 'nonsense' }),
    ).toBe(false);
  });
});

describe('createSenderValidator', () => {
  // Real events compare frames by identity, so build them that way.
  function eventFor({ url, isMain = true, hasFrame = true }) {
    const frame = { url };
    return {
      senderFrame: hasFrame ? frame : null,
      sender: { mainFrame: isMain ? frame : { url: 'other' } },
    };
  }

  const validator = createSenderValidator(production);
  const trustedUrl = `file://${APP_DIR}/index.html`;

  it('accepts the app page, in its main frame', () => {
    expect(validator.isTrusted(eventFor({ url: `file://${APP_DIR}/accounts` }))).toBe(true);
  });

  it('refuses a sub-frame even when it shows an app URL', () => {
    expect(validator.isTrusted(eventFor({ url: trustedUrl, isMain: false }))).toBe(false);
  });

  it('refuses a foreign page and a destroyed frame', () => {
    expect(validator.isTrusted(eventFor({ url: 'https://example.com/' }))).toBe(false);
    expect(validator.isTrusted(eventFor({ url: trustedUrl, hasFrame: false }))).toBe(false);
  });

  it('refuses malformed events without throwing', () => {
    for (const event of [undefined, null, {}, { senderFrame: {} }, { senderFrame: { url: 5 } }]) {
      expect(() => validator.isTrusted(event)).not.toThrow();
      expect(validator.isTrusted(event)).toBe(false);
    }
  });

  it('wraps a handler: runs it for a trusted sender and passes the payload through', async () => {
    const calls = [];
    const wrapped = validator.wrap('db:test:run', async (payload) => {
      calls.push(payload);
      return { ok: payload };
    });

    await expect(wrapped(eventFor({ url: trustedUrl }), { a: 1 })).resolves.toEqual({
      ok: { a: 1 },
    });
    expect(calls).toEqual([{ a: 1 }]);
  });

  it('wraps a handler: refuses an untrusted sender WITHOUT running it', async () => {
    let ran = false;
    const wrapped = validator.wrap('db:test:run', () => {
      ran = true;
      return 'secret';
    });

    await expect(wrapped(eventFor({ url: 'https://example.com/' }), {})).rejects.toThrow(
      /not allowed/i,
    );
    expect(ran).toBe(false);
  });

  it('names the channel in the refusal so it can be diagnosed', async () => {
    const wrapped = validator.wrap('db:accounts:remove', () => 'x');
    await expect(wrapped(eventFor({ url: 'https://example.com/' }))).rejects.toThrow(
      'db:accounts:remove',
    );
  });

  it('lets a handler error through unchanged for a trusted sender', async () => {
    const wrapped = validator.wrap('db:test:fail', () => {
      throw new Error('boom');
    });
    await expect(wrapped(eventFor({ url: trustedUrl }))).rejects.toThrow('boom');
  });

  it('reports each refusal to the logger, once per call', async () => {
    const logged = [];
    const logging = createSenderValidator({
      ...production,
      onRefused: (info) => logged.push(info),
    });
    const wrapped = logging.wrap('db:test:run', () => 'x');

    await expect(wrapped(eventFor({ url: 'https://example.com/x' }))).rejects.toThrow();
    await expect(wrapped(eventFor({ url: 'https://example.com/y' }))).rejects.toThrow();

    expect(logged.map((info) => info.channel)).toEqual(['db:test:run', 'db:test:run']);
    expect(logged.map((info) => info.url)).toEqual([
      'https://example.com/x',
      'https://example.com/y',
    ]);
  });
});

describe('installPermissionPolicy', () => {
  function fakeSession() {
    return {
      requestHandler: null,
      checkHandler: null,
      setPermissionRequestHandler(handler) {
        this.requestHandler = handler;
      },
      setPermissionCheckHandler(handler) {
        this.checkHandler = handler;
      },
    };
  }

  const permissions = [
    'media',
    'geolocation',
    'notifications',
    'midi',
    'midiSysex',
    'pointerLock',
    'fullscreen',
    'openExternal',
    'clipboard-read',
    'clipboard-sanitized-write',
    'display-capture',
    'idle-detection',
    'hid',
    'serial',
    'usb',
    'bluetooth',
    'window-management',
    'unknown-future-permission',
  ];

  it('denies every permission request', () => {
    const session = fakeSession();
    installPermissionPolicy(session);

    for (const permission of permissions) {
      const decisions = [];
      session.requestHandler({}, permission, (granted) => decisions.push(granted), {});
      expect(decisions, permission).toEqual([false]);
    }
  });

  it('denies every permission check', () => {
    const session = fakeSession();
    installPermissionPolicy(session);

    for (const permission of permissions) {
      expect(session.checkHandler({}, permission, 'file://', {}), permission).toBe(false);
    }
  });

  it('answers each request exactly once', () => {
    const session = fakeSession();
    installPermissionPolicy(session);
    let calls = 0;

    session.requestHandler({}, 'media', () => (calls += 1), {});

    expect(calls).toBe(1);
  });

  it('refuses to install on something that is not a session', () => {
    expect(() => installPermissionPolicy(null)).toThrow('needs an Electron session');
    expect(() => installPermissionPolicy({})).toThrow('needs an Electron session');
    expect(() => installPermissionPolicy({ setPermissionRequestHandler() {} })).toThrow(
      'needs an Electron session',
    );
  });
});
