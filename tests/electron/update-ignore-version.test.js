import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeTestDatabase, loadElectronModule, openTestDatabase } from './helpers/electron-db.js';

// "Ignore this version" stores the version string the renderer sends. The update check later compares
// it with a semver value, so only a valid semver string is worth storing; anything else is refused
// before it reaches SQLite.

let db;
let controller;

beforeEach(() => {
  db = openTestDatabase();
  controller = loadElectronModule('electron/controllers/update.controller.js');
});

afterEach(closeTestDatabase);

const stored = () =>
  db.prepare("SELECT value FROM app_meta WHERE key = 'ignoredUpdateVersion'").get()?.value;

describe('ignoreVersion', () => {
  it('stores a valid version', () => {
    controller.ignoreVersion({ version: '1.4.0' });
    expect(stored()).toBe('1.4.0');
  });

  it('overwrites a previous choice', () => {
    controller.ignoreVersion({ version: '1.4.0' });
    controller.ignoreVersion({ version: '1.5.0' });
    expect(stored()).toBe('1.5.0');
  });

  it('stores the normalized form, which is what the update check compares against', () => {
    controller.ignoreVersion({ version: ' v1.4.0 ' });
    expect(stored()).toBe('1.4.0');
  });

  it('does nothing when no version is sent, as before', () => {
    controller.ignoreVersion({});
    controller.ignoreVersion(undefined);
    controller.ignoreVersion(null);
    controller.ignoreVersion({ version: '' });
    controller.ignoreVersion({ version: null });
    expect(stored()).toBeUndefined();
  });

  it.each([
    ['an object', { version: { a: 1 } }],
    ['an array', { version: ['1.0.0'] }],
    ['a number', { version: 5 }],
    ['true', { version: true }],
    ['text', { version: 'latest' }],
    ['a partial version', { version: '1.4' }],
    ['a very long string', { version: '1'.repeat(100000) }],
    ['sql-looking text', { version: "1.0.0'; DROP TABLE accounts;--" }],
  ])('refuses %s without writing', (_label, payload) => {
    controller.ignoreVersion({ version: '1.0.0' });

    expect(() => controller.ignoreVersion(payload)).toThrow(/version/i);

    expect(stored()).toBe('1.0.0');
  });

  it('refuses a payload that is not an object', () => {
    for (const payload of ['1.0.0', 5, ['1.0.0'], true]) {
      expect(() => controller.ignoreVersion(payload)).toThrow(/payload/i);
    }
    expect(stored()).toBeUndefined();
  });
});
