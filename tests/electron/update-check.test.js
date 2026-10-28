import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeTestDatabase, loadElectronModule, openTestDatabase } from './helpers/electron-db.js';

// The update check talks to the GitHub API. It must not hang the app when the network stalls, and it
// must not hand the renderer a release link that the app would refuse to open anyway.

let controller;

beforeEach(() => {
  openTestDatabase();
  controller = loadElectronModule('electron/controllers/update.controller.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
  closeTestDatabase();
});

function stubRelease(release) {
  const fetchStub = vi.fn(async () => ({ ok: true, json: async () => release }));
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

describe('the request', () => {
  it('carries an abort signal so a stalled connection ends', async () => {
    const fetchStub = stubRelease({ tag_name: 'v9.0.0', html_url: 'x' });

    await controller.forceCheck();

    const options = fetchStub.mock.calls[0][1];
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);
  });

  it('turns an aborted request into a quiet "no update" answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('The operation timed out.', 'TimeoutError');
      }),
    );

    const result = await controller.forceCheck();

    expect(result.updateAvailable).toBe(false);
    expect(result.releaseUrl).toBeNull();
    expect(result.latestVersion).toBeNull();
  });
});

describe('the release link', () => {
  const repoRelease = 'https://github.com/Tratt0re/boring_balance/releases/tag/v9.0.0';

  it('is passed on when it points at the project releases', async () => {
    stubRelease({ tag_name: 'v9.0.0', html_url: repoRelease });

    const result = await controller.forceCheck();

    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe('9.0.0');
    expect(result.releaseUrl).toBe(repoRelease);
  });

  it.each([
    ['another site', 'https://evil.example/releases'],
    ['another repository', 'https://github.com/someone/else/releases/tag/v9.0.0'],
    ['a look-alike host', 'https://github.com.evil.example/Tratt0re/boring_balance'],
    ['a file URL', 'file:///etc/passwd'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['plain http', 'http://github.com/Tratt0re/boring_balance/releases'],
    ['not a string', { href: repoRelease }],
    ['an empty string', ''],
  ])('is dropped for %s, while the update is still reported', async (_label, htmlUrl) => {
    stubRelease({ tag_name: 'v9.0.0', html_url: htmlUrl });

    const result = await controller.forceCheck();

    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe('9.0.0');
    expect(result.releaseUrl).toBeNull();
  });

  it('is null when GitHub sent none', async () => {
    stubRelease({ tag_name: 'v9.0.0' });

    const result = await controller.forceCheck();

    expect(result.releaseUrl).toBeNull();
  });
});
