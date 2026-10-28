import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  isAllowedExternalUrl,
  openExternalIfAllowed,
} = require('../../electron/utils/external-url.js');

const REPO = 'https://github.com/Tratt0re/boring_balance';

describe('isAllowedExternalUrl', () => {
  describe('allowed', () => {
    it.each([
      [REPO],
      [`${REPO}/`],
      [`${REPO}/releases`],
      [`${REPO}/releases/tag/v1.0.2`],
      [`${REPO}/releases/latest`],
      [`${REPO}/issues/12`],
      [`${REPO}/blob/main/README.md#install`],
      [`${REPO}/wiki?foo=bar`],
      ['https://boringbalance.com'],
      ['https://boringbalance.com/'],
      ['https://boringbalance.com/docs/getting-started?lang=es#top'],
    ])('accepts %s', (url) => {
      expect(isAllowedExternalUrl(url)).toBe(true);
    });

    it('is not fooled by case, a default port, or surrounding whitespace', () => {
      expect(isAllowedExternalUrl('https://GITHUB.com/tratt0re/BORING_BALANCE/issues')).toBe(true);
      expect(isAllowedExternalUrl('HTTPS://BoringBalance.COM/')).toBe(true);
      expect(isAllowedExternalUrl('https://github.com:443/Tratt0re/boring_balance')).toBe(true);
      expect(isAllowedExternalUrl(`  ${REPO}/releases \n`)).toBe(true);
    });

    it('accepts fullwidth lookalikes only because the parser turns them into the real host', () => {
      expect(isAllowedExternalUrl('https://ｇｉｔｈｕｂ.com/Tratt0re/boring_balance')).toBe(true);
    });
  });

  describe('refused: other repositories and paths on github.com', () => {
    it.each([
      ['https://github.com'],
      ['https://github.com/'],
      ['https://github.com/Tratt0re'],
      ['https://github.com/Tratt0re/'],
      ['https://github.com/Tratt0re/other_repo'],
      ['https://github.com/Tratt0re/boring_balance2'],
      ['https://github.com/Tratt0re/boring_balance-evil/releases'],
      ['https://github.com/someone-else/boring_balance'],
      ['https://github.com/Tratt0re2/boring_balance'],
      ['https://github.com/evil/Tratt0re/boring_balance'],
      ['https://github.com/Tratt0re%2Fboring_balance'],
      ['https://github.com/Tratt0re/boring%5Fbalance'],
    ])('refuses %s', (url) => {
      expect(isAllowedExternalUrl(url)).toBe(false);
    });

    it.each([
      [`${REPO}/../../evil/repo`],
      [`${REPO}/%2e%2e/%2e%2e/evil/repo`],
      [`${REPO}/%2E%2E/evil`],
      [`${REPO}\\..\\..\\evil`],
      [`${REPO}/./../other`],
    ])('refuses path traversal out of the repository: %s', (url) => {
      expect(isAllowedExternalUrl(url)).toBe(false);
    });
  });

  describe('refused: lookalike and tricky hosts', () => {
    it.each([
      ['https://github.com@evil.com/Tratt0re/boring_balance'],
      ['https://boringbalance.com@evil.com/'],
      ['https://boringbalance.com.evil.com/'],
      ['https://evilboringbalance.com/'],
      ['https://boringbalance.com.evil.com/Tratt0re/boring_balance'],
      ['https://github.com.evil.com/Tratt0re/boring_balance'],
      ['https://evil.com/github.com/Tratt0re/boring_balance'],
      ['https://evil.com/?u=https://boringbalance.com/'],
      ['https://github.com./Tratt0re/boring_balance'],
      ['https://boringbalance.com./'],
      ['https://gıthub.com/Tratt0re/boring_balance'],
      ['https://api.github.com/repos/Tratt0re/boring_balance'],
      ['https://www.github.com/Tratt0re/boring_balance'],
      ['https://sub.boringbalance.com/'],
      ['https://boringbalance.org/'],
      ['https://github.io/Tratt0re/boring_balance'],
    ])('refuses %s', (url) => {
      expect(isAllowedExternalUrl(url)).toBe(false);
    });
  });

  describe('refused: scheme, credentials and port', () => {
    it.each([
      ['http://github.com/Tratt0re/boring_balance'],
      ['http://boringbalance.com/'],
      ['file:///etc/passwd'],
      ['file:///Applications/Boring%20Balance.app'],
      ['smb://evil.com/share'],
      ['ssh://github.com/Tratt0re/boring_balance'],
      ['ftp://boringbalance.com/'],
      ['javascript:alert(1)'],
      ['data:text/html,<script>alert(1)</script>'],
      ['vscode://file/etc/passwd'],
      ['ms-msdt:/id PCWDiagnostic'],
      ['x-apple.systempreferences:com.apple.preference.security'],
      ['mailto:someone@boringbalance.com'],
      ['about:blank'],
    ])('refuses %s', (url) => {
      expect(isAllowedExternalUrl(url)).toBe(false);
    });

    it('refuses embedded credentials and custom ports', () => {
      expect(isAllowedExternalUrl('https://user@github.com/Tratt0re/boring_balance')).toBe(false);
      expect(isAllowedExternalUrl('https://user:pw@boringbalance.com/')).toBe(false);
      expect(isAllowedExternalUrl('https://github.com:8443/Tratt0re/boring_balance')).toBe(false);
      expect(isAllowedExternalUrl('https://boringbalance.com:8080/')).toBe(false);
    });
  });

  describe('refused: not a usable URL', () => {
    it.each([
      [undefined],
      [null],
      [''],
      ['   '],
      ['github.com/Tratt0re/boring_balance'],
      ['//github.com/Tratt0re/boring_balance'],
      ['/Tratt0re/boring_balance'],
      ['not a url'],
      [42],
      [{}],
      [['https://boringbalance.com/']],
      [{ toString: () => 'https://boringbalance.com/' }],
      [new URL('https://boringbalance.com/')],
    ])('refuses %j', (value) => {
      expect(isAllowedExternalUrl(value)).toBe(false);
    });

    it('answers false instead of throwing, whatever the renderer sends', () => {
      for (const value of [undefined, null, 42, {}, [], Symbol('x'), () => 'https://boringbalance.com/']) {
        expect(() => isAllowedExternalUrl(value)).not.toThrow();
      }
    });
  });
});

describe('openExternalIfAllowed', () => {
  function recorder() {
    const opened = [];
    return { opened, open: async (url) => void opened.push(url) };
  }

  it('opens an allowed URL (trimmed) and reports true', async () => {
    const { opened, open } = recorder();

    await expect(openExternalIfAllowed(` ${REPO}/releases `, open)).resolves.toBe(true);

    expect(opened).toEqual([`${REPO}/releases`]);
  });

  it('opens the normalized URL, so the string that was checked is the string that is opened', async () => {
    const { opened, open } = recorder();

    await openExternalIfAllowed(
      'https://GITHUB.com:443/Tratt0re/boring_balance/../boring_balance/x',
      open,
    );

    expect(opened).toEqual(['https://github.com/Tratt0re/boring_balance/x']);
  });

  it('never calls the opener for a refused URL and reports false', async () => {
    const { opened, open } = recorder();

    for (const url of [
      'file:///etc/passwd',
      'https://evil.com/',
      'https://github.com@evil.com/',
      null,
      '',
    ]) {
      await expect(openExternalIfAllowed(url, open)).resolves.toBe(false);
    }

    expect(opened).toEqual([]);
  });

  it('lets a failure of the opener reach the caller', async () => {
    await expect(
      openExternalIfAllowed(REPO, async () => {
        throw new Error('no browser');
      }),
    ).rejects.toThrow('no browser');
  });
});
