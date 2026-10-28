import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeTestDatabase, loadElectronModule, openTestDatabase } from './helpers/electron-db.js';

// Startup reads and sets the first-start flag through the database layer. The renderer-facing app-meta
// controller refuses that key, so startup must never depend on it: a launch that goes through the
// controller would crash every time (this was caught by launching the packaged app).

let system;

beforeEach(() => {
  openTestDatabase();
  system = loadElectronModule('electron/database/system.js');
});

afterEach(closeTestDatabase);

describe('first start', () => {
  it('is reported on a fresh database', () => {
    expect(system.isFirstStart()).toBe(true);
  });

  it('is cleared once startup has completed', () => {
    system.markFirstStartCompleted();
    expect(system.isFirstStart()).toBe(false);
  });

  it('stays cleared across further starts, and marking it again is harmless', () => {
    system.markFirstStartCompleted();
    system.markFirstStartCompleted();
    expect(system.isFirstStart()).toBe(false);
  });

  it('does not depend on the renderer-facing controller, which refuses the key', () => {
    const controller = loadElectronModule('electron/controllers/app-meta.controller.js');

    expect(() => controller.get({ key: 'app.first_start' })).toThrow(/not available/i);
    expect(() => system.isFirstStart()).not.toThrow();
    expect(() => system.markFirstStartCompleted()).not.toThrow();
  });
});
