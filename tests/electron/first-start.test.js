import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeTestDatabase, loadElectronModule, openTestDatabase } from './helpers/electron-db.js';

// Startup reads and sets the first-start flag through the database layer (this was once routed through
// a controller that refused the key, and the packaged app crashed on every launch).

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
});
