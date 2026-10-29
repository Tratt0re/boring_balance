import { describe, expect, it } from 'vitest';

import { loadElectronModule } from './helpers/electron-db.js';

// One definition of "plain object" is shared by payload validation, the settings store, the sync index
// reader and the SQL condition builder, so they all agree on what an untrusted value may look like.

const { isPlainObject } = loadElectronModule('electron/utils/object-utils.js');

describe('isPlainObject', () => {
  it.each([
    ['an object literal', {}],
    ['a parsed JSON object', JSON.parse('{"a":1}')],
    ['an object without a prototype', Object.create(null)],
  ])('accepts %s', (_name, value) => {
    expect(isPlainObject(value)).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an array', []],
    ['a string', 'text'],
    ['a number', 1],
    ['a date', new Date()],
    ['a map', new Map()],
    ['a class instance', new (class Thing {})()],
  ])('rejects %s', (_name, value) => {
    expect(isPlainObject(value)).toBe(false);
  });
});
