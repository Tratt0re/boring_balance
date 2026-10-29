import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeTestDatabase, loadElectronModule, openTestDatabase } from './helpers/electron-db.js';

// app_meta holds values that sync and backup trust: the database identity, the change counter and the
// schema version. The renderer must not be able to read or rewrite them over IPC, so no channel or
// handler exists for the table at all. Only the main process reaches it, through the model.

let db;

beforeEach(() => {
  db = openTestDatabase();
});

afterEach(closeTestDatabase);

const readValue = (key) => db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key)?.value;

describe('the renderer has no way to reach app_meta', () => {
  it('has no channel for it', () => {
    const { CHANNELS } = loadElectronModule('electron/ipc/channels.js');

    expect(Object.keys(CHANNELS)).not.toContain('appMeta');
    expect(JSON.stringify(CHANNELS)).not.toMatch(/app-meta|app_meta|appMeta/i);
  });

  it('registers no handler for it', () => {
    const { IPC_HANDLERS } = loadElectronModule('electron/ipc/handlers.js');

    expect(Object.keys(IPC_HANDLERS).filter((channel) => /app-meta|app_meta/i.test(channel))).toEqual(
      [],
    );
  });

  it('has no controller for it', () => {
    const controllers = loadElectronModule('electron/controllers');

    expect(Object.keys(controllers)).not.toContain('appMetaController');
  });
});

describe('the main process keeps working', () => {
  it('still reads and writes its own keys through the model', () => {
    const { appMetaModel } = loadElectronModule('electron/models');

    appMetaModel.create({ key: 'ignoredUpdateVersion', value: '9.9.9' });
    appMetaModel.updateByKey('ignoredUpdateVersion', { value: '1.2.3' });
    appMetaModel.create({ key: 'somethingElse', value: 'x' });

    expect(appMetaModel.getByKey('ignoredUpdateVersion').value).toBe('1.2.3');
    expect(readValue('somethingElse')).toBe('x');
    expect(readValue('db_uuid')).toBeDefined();
  });
});
