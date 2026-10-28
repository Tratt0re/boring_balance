import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeTestDatabase,
  loadFreshElectronModule,
  openTestDatabase,
} from './helpers/electron-db.js';

// ELECTRON_RENDERER_URL points the window at a dev server. A packaged app must never honour it: an
// environment variable set by whatever launched the app would otherwise decide which page gets the
// IPC bridge.

const require = createRequire(import.meta.url);
const ORIGINAL_ARGV = [...process.argv];
const ORIGINAL_ENV = process.env.ELECTRON_RENDERER_URL;

let electronApp;

beforeEach(() => {
  openTestDatabase();
  electronApp = require('electron').app;
});

afterEach(() => {
  electronApp.isPackaged = false;
  process.argv = [...ORIGINAL_ARGV];
  if (ORIGINAL_ENV === undefined) {
    delete process.env.ELECTRON_RENDERER_URL;
  } else {
    process.env.ELECTRON_RENDERER_URL = ORIGINAL_ENV;
  }
  closeTestDatabase();
});

function trustedSources({ packaged, env }) {
  electronApp.isPackaged = packaged;
  if (env === undefined) {
    delete process.env.ELECTRON_RENDERER_URL;
  } else {
    process.env.ELECTRON_RENDERER_URL = env;
  }
  // The variable is read when window.js loads, so load a fresh copy for every case.
  return loadFreshElectronModule('electron/window.js').getTrustedRendererSources();
}

describe('getTrustedRendererSources', () => {
  it('trusts the default dev server when developing', () => {
    expect(trustedSources({ packaged: false, env: undefined }).devServerUrl).toBe(
      'http://localhost:4200',
    );
  });

  it('trusts the dev server named by the variable when developing', () => {
    expect(trustedSources({ packaged: false, env: 'http://localhost:4300' }).devServerUrl).toBe(
      'http://localhost:4300',
    );
  });

  it('ignores the variable in a packaged app', () => {
    expect(
      trustedSources({ packaged: true, env: 'http://evil.example:4200' }).devServerUrl,
    ).toBeNull();
  });

  it('trusts no dev server in a packaged app without the variable either', () => {
    expect(trustedSources({ packaged: true, env: undefined }).devServerUrl).toBeNull();
  });

  it('trusts no dev server when started in production mode', () => {
    process.argv = [...ORIGINAL_ARGV, '--prod'];
    expect(
      trustedSources({ packaged: false, env: 'http://localhost:4300' }).devServerUrl,
    ).toBeNull();
  });

  it('does not even keep the variable around in a packaged app', () => {
    electronApp.isPackaged = true;
    process.env.ELECTRON_RENDERER_URL = 'http://evil.example:4200';
    const loaded = loadFreshElectronModule('electron/window.js');
    electronApp.isPackaged = false;
    delete process.env.ELECTRON_RENDERER_URL;

    // Packaged at load time, then (unrealistically) flipped to development: the constant stays default.
    electronApp.isPackaged = false;
    expect(loaded.getTrustedRendererSources().devServerUrl).toBe('http://localhost:4200');
  });

  it('always names the built renderer directory', () => {
    const sources = trustedSources({ packaged: true, env: undefined });
    expect(sources.rendererDir.replace(/\\/g, '/')).toMatch(/dist\/boringbalance\/browser$/);
  });
});
