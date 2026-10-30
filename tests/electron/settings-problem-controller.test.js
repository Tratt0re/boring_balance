import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeTestDatabase,
  loadFreshElectronModule,
  openTestDatabase,
} from './helpers/electron-db.js';

// A damaged settings.json is moved aside and the app starts from defaults. The settings controller
// hands that fact to the Settings page so the user is told, without exposing the full path.

let store;
let controller;

beforeEach(() => {
  openTestDatabase();
  store = loadFreshElectronModule('electron/utils/settings-store.js');
  controller = loadFreshElectronModule('electron/controllers/settings.controller.js');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  closeTestDatabase();
});

describe('settings controller', () => {
  it('reports no problem for a healthy or missing settings file', () => {
    expect(controller.getProblem()).toBeNull();

    store.setSettingsSection('backup', { enabled: true });
    store.getSettingsSection('backup');
    expect(controller.getProblem()).toBeNull();
  });

  it('reports a damaged file with the kept copy name only, not its path', () => {
    fs.writeFileSync(store.getSettingsFilePath(), '{ not json');
    store.getSettingsSection('backup');

    const problem = controller.getProblem();
    expect(problem.keptFileName).toMatch(/^settings\.json\.corrupt-\d+/);
    expect(problem.keptFileName).toBe(path.basename(problem.keptFileName));
    expect(typeof problem.reason).toBe('string');
    expect(problem.at).toBeGreaterThan(0);
    expect(Object.keys(problem).sort()).toEqual(['at', 'keptFileName', 'reason']);
  });

  it('forgets the problem once acknowledged, and a later healthy read does not bring it back', () => {
    fs.writeFileSync(store.getSettingsFilePath(), '[]');
    store.getSettingsSection('backup');
    expect(controller.getProblem()).not.toBeNull();

    controller.acknowledgeProblem();

    expect(controller.getProblem()).toBeNull();
    store.getSettingsSection('backup');
    expect(controller.getProblem()).toBeNull();
  });

  it('reports a null file name when the damaged file could not be moved aside', () => {
    fs.writeFileSync(store.getSettingsFilePath(), '{ not json');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('read-only');
    });
    store.getSettingsSection('backup');

    expect(controller.getProblem().keptFileName).toBeNull();
  });
});
