import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeTestDatabase,
  loadFreshElectronModule,
  openTestDatabase,
} from './helpers/electron-db.js';

// settings.json holds the backup and sync configuration. A corrupt file used to be read as "no
// settings", and the next write replaced it with defaults, losing the user's folders and schedules
// without a trace. Now the corrupt file is kept aside, the problem is logged and reported, and only
// then do defaults apply.

let store;

beforeEach(() => {
  openTestDatabase();
  store = loadFreshElectronModule('electron/utils/settings-store.js');
});

afterEach(() => {
  vi.restoreAllMocks();
  closeTestDatabase();
});

const file = () => store.getSettingsFilePath();
const dir = () => path.dirname(file());
const corruptCopies = () =>
  fs.readdirSync(dir()).filter((name) => name.startsWith('settings.json.corrupt-'));
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('a healthy settings file', () => {
  it('is read as it is and left alone', () => {
    store.setSettingsSection('backup', { enabled: true, retentionCount: 3 });

    expect(store.getSettingsSection('backup', { enabled: false, other: 1 })).toEqual({
      enabled: true,
      retentionCount: 3,
      other: 1,
    });
    expect(corruptCopies()).toEqual([]);
    expect(store.getSettingsProblem()).toBeNull();
  });

  it('treats a missing file, an empty file and a blank file as "no settings", not as damage', () => {
    expect(store.getSettingsSection('backup', { a: 1 })).toEqual({ a: 1 });

    fs.writeFileSync(file(), '');
    expect(store.getSettingsSection('backup', { a: 1 })).toEqual({ a: 1 });

    fs.writeFileSync(file(), '  \n ');
    expect(store.getSettingsSection('backup', { a: 1 })).toEqual({ a: 1 });

    expect(fs.existsSync(file())).toBe(true);
    expect(corruptCopies()).toEqual([]);
    expect(store.getSettingsProblem()).toBeNull();
  });
});

describe.each([
  ['truncated JSON', '{"backup": {"enabled": tr'],
  ['text that is not JSON', 'hello there'],
  ['a JSON array', '[1,2,3]'],
  ['a JSON string', '"settings"'],
  ['a JSON number', '42'],
  ['JSON null', 'null'],
])('a damaged settings file (%s)', (_label, content) => {
  beforeEach(() => {
    quiet();
    fs.writeFileSync(file(), content);
  });

  it('is kept aside with its content intact', () => {
    store.getSettingsSection('backup', {});

    const [copy] = corruptCopies();
    expect(corruptCopies()).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir(), copy), 'utf8')).toBe(content);
  });

  it('is no longer in the way, so reading gives the defaults', () => {
    expect(store.getSettingsSection('backup', { enabled: false })).toEqual({ enabled: false });
    expect(fs.existsSync(file())).toBe(false);
  });

  it('is logged', () => {
    store.getSettingsSection('backup', {});

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('settings.json'),
      expect.anything(),
    );
  });

  it('is reported through getSettingsProblem, naming the preserved copy', () => {
    store.getSettingsSection('backup', {});

    const problem = store.getSettingsProblem();
    expect(problem.corruptCopyPath).toBe(path.join(dir(), corruptCopies()[0]));
    expect(problem.at).toBeTypeOf('number');
  });

  it('is not rewritten with defaults by a later write; the preserved copy stays as it was', () => {
    store.getSettingsSection('backup', {});
    store.setSettingsSection('backup', { enabled: true });

    expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toEqual({ backup: { enabled: true } });
    expect(fs.readFileSync(path.join(dir(), corruptCopies()[0]), 'utf8')).toBe(content);
  });

  it('is handled once: reading again does not make another copy', () => {
    store.getSettingsSection('backup', {});
    store.getSettingsSection('sync', {});
    store.getSettingsSection('backup', {});

    expect(corruptCopies()).toHaveLength(1);
  });
});

describe('damage found by a write', () => {
  it('is handled the same way, so a patch cannot overwrite a damaged file', () => {
    quiet();
    fs.writeFileSync(file(), '{ broken');

    store.patchSettingsSection('sync', { enabled: true }, { enabled: false });

    expect(corruptCopies()).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir(), corruptCopies()[0]), 'utf8')).toBe('{ broken');
    expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toEqual({ sync: { enabled: true } });
  });
});

describe('two damaged files in a row', () => {
  it('each keep their own copy, even within the same millisecond', () => {
    quiet();
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    fs.writeFileSync(file(), 'first damage');
    store.getSettingsSection('backup', {});
    fs.writeFileSync(file(), 'second damage');
    store.getSettingsSection('backup', {});

    const contents = corruptCopies()
      .map((name) => fs.readFileSync(path.join(dir(), name), 'utf8'))
      .sort();
    expect(contents).toEqual(['first damage', 'second damage']);
  });
});

describe('when the damaged file cannot be moved', () => {
  it('still starts with defaults and says so, without throwing', () => {
    quiet();
    fs.writeFileSync(file(), '{ broken');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('rename refused');
    });

    expect(store.getSettingsSection('backup', { a: 1 })).toEqual({ a: 1 });

    expect(store.getSettingsProblem()).toMatchObject({ corruptCopyPath: null });
    expect(console.error).toHaveBeenCalled();
  });

  it('does not write over the damaged file in that case', () => {
    quiet();
    fs.writeFileSync(file(), '{ broken');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('rename refused');
    });

    expect(() => store.setSettingsSection('backup', { enabled: true })).toThrow(/damaged/i);

    expect(fs.readFileSync(file(), 'utf8')).toBe('{ broken');
  });
});

describe('a patch when the damaged file cannot be moved', () => {
  it('refuses to overwrite it, like a plain write does', () => {
    quiet();
    fs.writeFileSync(file(), '{ broken');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('rename refused');
    });

    expect(() => store.patchSettingsSection('sync', { enabled: true })).toThrow(/damaged/i);

    expect(fs.readFileSync(file(), 'utf8')).toBe('{ broken');
  });
});

describe('the reported problem', () => {
  it('can be acknowledged, after which nothing is reported', () => {
    quiet();
    fs.writeFileSync(file(), '{ broken');
    store.getSettingsSection('backup', {});
    expect(store.getSettingsProblem()).not.toBeNull();

    store.acknowledgeSettingsProblem();

    expect(store.getSettingsProblem()).toBeNull();
  });

  it('is cleared by clearSettingsStore, which is a deliberate reset', () => {
    quiet();
    fs.writeFileSync(file(), '{ broken');
    store.getSettingsSection('backup', {});

    store.clearSettingsStore();

    expect(store.getSettingsProblem()).toBeNull();
  });
});
