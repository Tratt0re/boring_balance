import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeTestDatabase,
  loadElectronModule,
  openTestDatabase,
  readChangeCounter,
} from './helpers/electron-db.js';

// app_meta holds values that sync and backup trust: the database identity, the change counter and the
// schema version. The renderer must not be able to read or rewrite them over IPC, so the controller
// only answers for keys on an explicit allow-list (empty today: the renderer needs none).

const INTERNAL_KEYS = [
  'app.first_start',
  'db_uuid',
  'change_counter',
  'last_write_ms',
  'schema_version',
  'lastUpdateCheck',
  'ignoredUpdateVersion',
];

const refused = /not available/i;

let db;
let controller;

beforeEach(() => {
  db = openTestDatabase();
  controller = loadElectronModule('electron/controllers/app-meta.controller.js');
  const seed = db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)');
  seed.run('lastUpdateCheck', '1700000000000');
  seed.run('ignoredUpdateVersion', '9.9.9');
});

afterEach(closeTestDatabase);

const readRows = () =>
  JSON.stringify(db.prepare('SELECT key, value FROM app_meta ORDER BY key').all());
const readValue = (key) => db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key)?.value;

describe.each(INTERNAL_KEYS)('internal key %s', (key) => {
  it('cannot be read', () => {
    expect(() => controller.get({ key })).toThrow(refused);
    expect(() => controller.get(key)).toThrow(refused);
  });

  it('cannot be created, updated, upserted or removed', () => {
    const before = readRows();

    expect(() => controller.create({ key, value: 'attacker' })).toThrow(refused);
    expect(() => controller.update({ key, changes: { value: 'attacker' } })).toThrow(refused);
    expect(() => controller.upsert({ key, value: 'attacker' })).toThrow(refused);
    expect(() => controller.remove({ key })).toThrow(refused);
    expect(() => controller.remove(key)).toThrow(refused);

    expect(readRows()).toBe(before);
  });

  it('is not reachable through different spelling', () => {
    const before = readRows();

    expect(() => controller.upsert({ key: ` ${key} `, value: 'attacker' })).toThrow(refused);
    expect(() => controller.upsert({ key: key.toUpperCase(), value: 'attacker' })).toThrow(refused);

    expect(readRows()).toBe(before);
  });
});

describe('a key nobody listed', () => {
  it('is refused for every operation', () => {
    const before = readRows();

    expect(() => controller.get({ key: 'theme' })).toThrow(refused);
    expect(() => controller.create({ key: 'theme', value: 'dark' })).toThrow(refused);
    expect(() => controller.update({ key: 'theme', changes: { value: 'dark' } })).toThrow(refused);
    expect(() => controller.upsert({ key: 'theme', value: 'dark' })).toThrow(refused);
    expect(() => controller.remove({ key: 'theme' })).toThrow(refused);

    expect(readRows()).toBe(before);
  });
});

describe('what an attack would have achieved', () => {
  it('cannot give the database a new identity', () => {
    const identity = readValue('db_uuid');
    expect(() => controller.upsert({ key: 'db_uuid', value: 'forged' })).toThrow();
    expect(readValue('db_uuid')).toBe(identity);
  });

  it('cannot reset the change counter', () => {
    const counter = readChangeCounter(db);
    expect(() => controller.update({ key: 'change_counter', changes: { value: '0' } })).toThrow();
    expect(readChangeCounter(db)).toBe(counter);
  });

  it('cannot delete the schema version', () => {
    expect(() => controller.remove({ key: 'schema_version' })).toThrow();
    expect(readValue('schema_version')).toBeDefined();
  });

  it('cannot touch the update-check state', () => {
    expect(() => controller.upsert({ key: 'ignoredUpdateVersion', value: '0.0.0' })).toThrow();
    expect(() => controller.remove({ key: 'lastUpdateCheck' })).toThrow();
    expect(readValue('ignoredUpdateVersion')).toBe('9.9.9');
    expect(readValue('lastUpdateCheck')).toBe('1700000000000');
  });
});

describe('listing', () => {
  it.each([
    [undefined],
    [{}],
    [{ where: { key: 'db_uuid' } }],
    [{ where: { key: ['db_uuid', 'change_counter'] } }],
    [{ options: { limit: 100 } }],
  ])('returns no internal row for %j', (payload) => {
    const leaked = controller.list(payload).filter((row) => INTERNAL_KEYS.includes(row.key));
    expect(leaked).toEqual([]);
  });
});

describe('the main process keeps working', () => {
  it('still reads and writes its own keys through the model', () => {
    const { appMetaModel } = loadElectronModule('electron/models');

    appMetaModel.updateByKey('ignoredUpdateVersion', { value: '1.2.3' });
    appMetaModel.create({ key: 'somethingElse', value: 'x' });

    expect(appMetaModel.getByKey('ignoredUpdateVersion').value).toBe('1.2.3');
    expect(readValue('somethingElse')).toBe('x');
  });
});
