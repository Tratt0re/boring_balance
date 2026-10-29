import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadFreshElectronModule } from './helpers/electron-db.js';

// Tags are stored as JSON text. When that text is damaged the row still loads (with no tags), but the
// damage used to be invisible. It is now logged with the row's id, once per row, so it can be found.

const TAGS_MODULE = 'electron/models/transactions/tags.js';

// The module remembers which rows it has already reported, so each test starts from a fresh copy.
let normalizeRowTags;
let normalizeRowsTags;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  ({ normalizeRowTags, normalizeRowsTags } = loadFreshElectronModule(TAGS_MODULE));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const row = (tags, id = 7) => ({ id, account_id: 1, plan_item_id: null, tags });

describe('tags that are fine', () => {
  it.each([
    ['an empty list', '[]', []],
    ['one tag', '["food"]', ['food']],
    ['several tags', '["a","b","c"]', ['a', 'b', 'c']],
  ])('decodes %s without a warning', (_label, stored, expected) => {
    expect(normalizeRowTags(row(stored)).tags).toEqual(expected);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([[null], [undefined], [''], ['   ']])(
    'treats %j as no tags, without a warning',
    (stored) => {
      expect(normalizeRowTags(row(stored)).tags).toEqual([]);
      expect(console.warn).not.toHaveBeenCalled();
    },
  );
});

describe('tags that are damaged', () => {
  it.each([
    ['text that is not JSON', 'not json'],
    ['truncated JSON', '["food", "tra'],
    ['an object', '{"a":1}'],
    ['a string', '"food"'],
    ['a number', '5'],
    ['a stored non-string value', 5],
  ])('still loads the row with no tags, for %s', (_label, stored) => {
    const result = normalizeRowTags(row(stored));

    expect(result.tags).toEqual([]);
    expect(result.id).toBe(7);
  });

  it.each([
    ['text that is not JSON', 'not json'],
    ['truncated JSON', '["food", "tra'],
    ['an object', '{"a":1}'],
    ['a string', '"food"'],
  ])('warns with the row id for %s', (_label, stored) => {
    normalizeRowTags(row(stored, 42));

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('42'));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('tags'));
  });

  it.each([[5], [true], [{}], [['a']]])(
    'warns for a stored value that is not text: %j',
    (stored) => {
      normalizeRowTags(row(stored, 11));

      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('11'));
    },
  );

  it('warns when some entries are not strings, and keeps the valid ones', () => {
    const result = normalizeRowTags(row('["food", 5, null, "rent"]', 9));

    expect(result.tags).toEqual(['food', 'rent']);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('9'));
  });

  it('does not put the damaged text into the log, which could hold user data', () => {
    normalizeRowTags(row('["private note", "tra', 3));

    expect(JSON.stringify(console.warn.mock.calls)).not.toContain('private note');
  });
});

describe('many rows', () => {
  it('warns once per damaged row, naming each', () => {
    normalizeRowsTags([row('bad', 1), row('["ok"]', 2), row('{"x":1}', 3)]);

    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(console.warn.mock.calls[0][0]).toContain('1');
    expect(console.warn.mock.calls[1][0]).toContain('3');
  });

  it('stays quiet when every row is fine', () => {
    normalizeRowsTags([row('[]', 1), row('["a"]', 2), row(null, 3)]);

    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('a row without an id', () => {
  it('still decodes and warns, without crashing', () => {
    const result = normalizeRowTags({ account_id: 1, tags: 'bad' });

    expect(result.tags).toEqual([]);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('the same damaged row seen again', () => {
  it('is logged only once, so refreshing a list does not flood the log', () => {
    normalizeRowTags(row('bad', 5));
    normalizeRowTags(row('bad', 5));
    normalizeRowsTags([row('bad', 5), row('bad', 5)]);

    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('still logs a different damaged row', () => {
    normalizeRowTags(row('bad', 5));
    normalizeRowTags(row('bad', 6));

    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('still returns the same decoded tags every time', () => {
    const first = normalizeRowTags(row('["a", 5]', 8));
    const second = normalizeRowTags(row('["a", 5]', 8));

    expect(first.tags).toEqual(['a']);
    expect(second.tags).toEqual(['a']);
  });
});

describe('no row', () => {
  it('returns null', () => {
    expect(normalizeRowTags(null)).toBeNull();
    expect(normalizeRowTags(undefined)).toBeNull();
  });
});
