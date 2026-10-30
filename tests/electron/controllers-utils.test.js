import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const u = require('../../electron/controllers/utils.js');

// Tests marked `it.fails` describe the DESIRED behavior of a known weakness. They pass while the
// weakness exists and start failing once it is fixed, which is the signal to turn them into plain
// `it`.

describe('ensurePlainObject / ensureNonEmptyObject / ensureHasKeys', () => {
  it('returns the very same object', () => {
    const value = { a: 1 };
    expect(u.ensurePlainObject(value, 'x')).toBe(value);
  });

  it.each([[null], [undefined], [[]], ['str'], [5], [true], [() => 1]])('rejects %j', (value) => {
    expect(() => u.ensurePlainObject(value, 'payload')).toThrow('payload must be a plain object.');
  });

  it('accepts objects without a prototype', () => {
    expect(() => u.ensurePlainObject(Object.create(null), 'x')).not.toThrow();
  });

  it.each([
    ['a Date', () => new Date()],
    ['a Map', () => new Map()],
    ['a Set', () => new Set()],
    ['a RegExp', () => /x/],
    ['a class instance', () => new (class Thing {})()],
    ['a function', () => () => 1],
  ])('rejects %s (PLAN 3.13)', (_label, make) => {
    expect(() => u.ensurePlainObject(make(), 'x')).toThrow('x must be a plain object.');
  });

  it('accepts an object with no prototype, as structured clone and JSON.parse can produce', () => {
    const value = Object.assign(Object.create(null), { a: 1 });
    expect(u.ensurePlainObject(value, 'x')).toBe(value);
    expect(u.ensurePlainObject(JSON.parse('{"a":1}'), 'x')).toEqual({ a: 1 });
  });

  it('ensureNonEmptyObject rejects {} but accepts any key', () => {
    expect(() => u.ensureNonEmptyObject({}, 'body')).toThrow('body cannot be empty.');
    expect(u.ensureNonEmptyObject({ a: undefined }, 'body')).toEqual({ a: undefined });
  });

  it('ensureHasKeys rejects {} only', () => {
    expect(() => u.ensureHasKeys({}, 'changes')).toThrow('changes cannot be empty.');
    expect(() => u.ensureHasKeys({ a: 1 }, 'changes')).not.toThrow();
  });
});

describe('assertAllowedKeys', () => {
  const allowed = new Set(['a', 'b']);

  it('accepts a subset of the allowed keys, including none', () => {
    expect(() => u.assertAllowedKeys({}, allowed, 'p')).not.toThrow();
    expect(() => u.assertAllowedKeys({ a: 1 }, allowed, 'p')).not.toThrow();
  });

  it('names the first unsupported key and the label', () => {
    expect(() => u.assertAllowedKeys({ a: 1, evil: 2 }, allowed, 'payload')).toThrow(
      'Unsupported payload field: "evil"',
    );
  });

  it('rejects an own __proto__ key produced by JSON.parse', () => {
    const body = JSON.parse('{"__proto__": {"admin": true}}');
    expect(() => u.assertAllowedKeys(body, allowed, 'p')).toThrow('Unsupported p field');
  });
});

describe('requireString', () => {
  it('trims by default', () => {
    expect(u.requireString('  hi  ', 'name')).toBe('hi');
  });

  it('keeps whitespace when trim is false', () => {
    expect(u.requireString('  hi  ', 'name', { trim: false })).toBe('  hi  ');
  });

  it('rejects empty and whitespace-only strings unless allowEmpty', () => {
    expect(() => u.requireString('', 'name')).toThrow('name cannot be empty.');
    expect(() => u.requireString('   ', 'name')).toThrow('name cannot be empty.');
    expect(u.requireString('   ', 'name', { allowEmpty: true })).toBe('');
  });

  it.each([[null], [undefined], [5], [{}], [['a']]])('rejects non-string %j', (value) => {
    expect(() => u.requireString(value, 'name')).toThrow('name must be a string.');
  });

  it('measures length after trimming', () => {
    expect(u.requireString('  abc  ', 'n', { minLength: 3, maxLength: 3 })).toBe('abc');
    expect(() => u.requireString(' ab ', 'n', { minLength: 3 })).toThrow(
      'n must be at least 3 characters.',
    );
    expect(() => u.requireString('abcd', 'n', { maxLength: 3 })).toThrow(
      'n must be at most 3 characters.',
    );
  });
});

describe('normalizeOptionalString', () => {
  it('passes undefined through and returns null for null', () => {
    expect(u.normalizeOptionalString(undefined, 'x')).toBeUndefined();
    expect(u.normalizeOptionalString(null, 'x')).toBeNull();
  });

  it('rejects null only when allowNull is false', () => {
    expect(() => u.normalizeOptionalString(null, 'x', { allowNull: false })).toThrow(
      'x cannot be null.',
    );
  });

  it('otherwise behaves like requireString', () => {
    expect(u.normalizeOptionalString(' a ', 'x')).toBe('a');
    expect(() => u.normalizeOptionalString('', 'x')).toThrow('x cannot be empty.');
    expect(() => u.normalizeOptionalString(3, 'x')).toThrow('x must be a string.');
  });
});

describe('normalizeEnum', () => {
  const allowed = new Set(['income', 'expense']);

  it('accepts a member and trims it', () => {
    expect(u.normalizeEnum(' income ', 'type', allowed)).toBe('income');
  });

  it('lists the allowed values in the error', () => {
    expect(() => u.normalizeEnum('other', 'type', allowed)).toThrow(
      'type must be one of: income, expense.',
    );
  });

  it('is case sensitive and rejects non-strings', () => {
    expect(() => u.normalizeEnum('Income', 'type', allowed)).toThrow();
    expect(() => u.normalizeEnum(1, 'type', allowed)).toThrow('type must be a string.');
  });
});

describe('boolean flags', () => {
  it.each([
    [true, 1],
    [false, 0],
    [1, 1],
    [0, 0],
  ])('normalizeBooleanFlag(%j) = %i', (input, expected) => {
    expect(u.normalizeBooleanFlag(input, 'f')).toBe(expected);
  });

  it.each([[2], [-1], ['true'], ['1'], [null], [undefined], [{}]])('rejects %j', (input) => {
    expect(() => u.normalizeBooleanFlag(input, 'f')).toThrow('f must be a boolean or 0/1.');
  });

  it('optional variant keeps undefined but still rejects bad values', () => {
    expect(u.normalizeOptionalBooleanFlag(undefined, 'f')).toBeUndefined();
    expect(u.normalizeOptionalBooleanFlag(true, 'f')).toBe(1);
    expect(() => u.normalizeOptionalBooleanFlag(null, 'f')).toThrow();
  });
});

describe('normalizePositiveInteger', () => {
  it.each([
    [1, 1],
    [42, 42],
    ['5', 5],
    [' 7 ', 7],
  ])('accepts %j', (input, expected) => {
    expect(u.normalizePositiveInteger(input, 'id')).toBe(expected);
  });

  it.each([
    [0],
    [-3],
    [1.5],
    ['abc'],
    [''],
    [null],
    [undefined],
    [NaN],
    [Infinity],
    [false],
    [{}],
    [[]],
    [[1, 2]],
  ])('rejects %j', (input) => {
    expect(() => u.normalizePositiveInteger(input, 'id')).toThrow('id must be a positive integer.');
  });

  // Number() coercion lets these through the IPC trust boundary.
  it.each([
    [true],
    [[5]],
    [['5']],
    ['0x10'],
    ['1e3'],
    ['1.0'],
    ['5.'],
    ['.5'],
    ['1_000'],
    ['Infinity'],
    ['5 5'],
    [new Date(5)],
  ])('rejects %j (PLAN 3.13)', (input) => {
    expect(() => u.normalizePositiveInteger(input, 'id')).toThrow('id must be a positive integer.');
  });

  it('rejects a BigInt, which Number() would otherwise convert', () => {
    expect(() => u.normalizePositiveInteger(5n, 'id')).toThrow('id must be a positive integer.');
  });

  it('rejects integers too large to be exact', () => {
    expect(u.normalizePositiveInteger(Number.MAX_SAFE_INTEGER, 'id')).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => u.normalizePositiveInteger(Number.MAX_SAFE_INTEGER + 1, 'id')).toThrow();
    expect(() => u.normalizePositiveInteger('9007199254740993', 'id')).toThrow();
    expect(() => u.normalizePositiveInteger(1e300, 'id')).toThrow();
  });

  it('still accepts a leading plus and leading zeros, as before', () => {
    expect(u.normalizePositiveInteger('+7', 'id')).toBe(7);
    expect(u.normalizePositiveInteger('007', 'id')).toBe(7);
  });
});

describe('normalizeOptionalInteger', () => {
  it('keeps undefined and null, validates the rest as positive', () => {
    expect(u.normalizeOptionalInteger(undefined, 'x')).toBeUndefined();
    expect(u.normalizeOptionalInteger(null, 'x')).toBeNull();
    expect(u.normalizeOptionalInteger('3', 'x')).toBe(3);
    expect(() => u.normalizeOptionalInteger(0, 'x')).toThrow('x must be a positive integer.');
  });
});

describe('normalizeInteger / normalizeNonNegativeInteger', () => {
  it('normalizeInteger accepts negatives and zero', () => {
    expect(u.normalizeInteger(-4, 'n')).toBe(-4);
    expect(u.normalizeInteger(0, 'n')).toBe(0);
    expect(u.normalizeInteger('12', 'n')).toBe(12);
  });

  it.each([[1.5], ['abc'], [NaN], [Infinity], [{}]])('normalizeInteger rejects %j', (input) => {
    expect(() => u.normalizeInteger(input, 'n')).toThrow('n must be an integer.');
  });

  it('normalizeNonNegativeInteger accepts zero and rejects negatives', () => {
    expect(u.normalizeNonNegativeInteger(0, 'n')).toBe(0);
    expect(u.normalizeNonNegativeInteger('2', 'n')).toBe(2);
    expect(() => u.normalizeNonNegativeInteger(-1, 'n')).toThrow(
      'n must be a non-negative integer.',
    );
    expect(() => u.normalizeNonNegativeInteger(0.5, 'n')).toThrow();
  });

  // Number(null), Number(''), Number(false) and Number([]) are all 0, so "missing" becomes zero.
  it.each([[null], [undefined], [''], ['  '], [false], [true], [[]], [[3]], ['0x10'], ['1e3']])(
    'normalizeInteger rejects %j (PLAN 3.13)',
    (input) => {
      expect(() => u.normalizeInteger(input, 'n')).toThrow('n must be an integer.');
    },
  );

  it.each([[null], [undefined], [''], ['  '], [false], [true], [[]], [[3]], ['0x10'], ['1e3']])(
    'normalizeNonNegativeInteger rejects %j (PLAN 3.13)',
    (input) => {
      expect(() => u.normalizeNonNegativeInteger(input, 'n')).toThrow(
        'n must be a non-negative integer.',
      );
    },
  );

  it('rejects a BigInt in both non-positive integer validators', () => {
    expect(() => u.normalizeInteger(5n, 'n')).toThrow('n must be an integer.');
    expect(() => u.normalizeNonNegativeInteger(5n, 'n')).toThrow(
      'n must be a non-negative integer.',
    );
  });

  it('keeps accepting signed digit strings and the safe-integer range', () => {
    expect(u.normalizeInteger(' -12 ', 'n')).toBe(-12);
    expect(u.normalizeInteger('+3', 'n')).toBe(3);
    expect(u.normalizeInteger(-0, 'n')).toBe(0);
    expect(Object.is(u.normalizeInteger('-0', 'n'), 0)).toBe(true);
    expect(u.normalizeNonNegativeInteger('0', 'n')).toBe(0);
    expect(() => u.normalizeInteger(Number.MAX_SAFE_INTEGER + 1, 'n')).toThrow();
    expect(() => u.normalizeNonNegativeInteger('-0x1', 'n')).toThrow();
  });
});

describe('normalizeAmountToCents', () => {
  it.each([
    [1.5, 150],
    [0, 0],
    [12, 1200],
    [0.01, 1],
    [-1.5, -150],
    [-0.01, -1],
    [1234567.89, 123456789],
    [-1234567.89, -123456789],
    [0.1, 10],
    [99.99, 9999],
    [123456789.12, 12345678912],
  ])('converts %j to %i cents', (input, expected) => {
    expect(u.normalizeAmountToCents(input, 'a')).toBe(expected);
  });

  it('is symmetric for negative values', () => {
    for (const value of [0.07, 3.14, 99.99, 1234.56]) {
      expect(u.normalizeAmountToCents(-value, 'a')).toBe(-u.normalizeAmountToCents(value, 'a'));
    }
  });

  it('does not return negative zero', () => {
    expect(Object.is(u.normalizeAmountToCents(-0, 'a'), 0)).toBe(true);
  });

  it.each([['1.5'], [null], [undefined], [NaN], [Infinity], [-Infinity], [{}]])(
    'rejects %j',
    (input) => {
      expect(() => u.normalizeAmountToCents(input, 'a')).toThrow('a must be a number.');
    },
  );

  it.each([[1.005], [2.675], [-2.675], [0.001], [0.1 + 0.2], [1e-7], [-0.005]])(
    'rejects more than two decimals instead of rounding silently: %j (PLAN 3.9)',
    (input) => {
      expect(() => u.normalizeAmountToCents(input, 'a')).toThrow(/2 decimal places/);
    },
  );

  it.each([[1e20], [-1e20], [1e21], [2 ** 60]])(
    'rejects values beyond the safe integer range: %j (PLAN 3.9)',
    (input) => {
      expect(() => u.normalizeAmountToCents(input, 'a')).toThrow();
    },
  );

  it('accepts amounts up to the safe-integer limit of cents, and refuses beyond it', () => {
    // 90071992547409.9 is the largest two-decimal amount a double can hold below 2^53 cents.
    expect(u.normalizeAmountToCents(90071992547409.9, 'a')).toBe(9007199254740990);
    expect(u.normalizeAmountToCents(-90071992547409.9, 'a')).toBe(-9007199254740990);
    expect(() => u.normalizeAmountToCents(90071992547409.92, 'a')).toThrow(/too large/);
    expect(() => u.normalizeAmountToCents(-90071992547409.92, 'a')).toThrow(/too large/);
  });

  it('names the field in the error', () => {
    expect(() => u.normalizeAmountToCents(1.005, 'payload.amount')).toThrow(/^payload\.amount /);
  });
});

describe('normalizeOptionalAmountFilterToCents', () => {
  it('keeps undefined and returns absolute cents', () => {
    expect(u.normalizeOptionalAmountFilterToCents(undefined, 'f')).toBeUndefined();
    expect(u.normalizeOptionalAmountFilterToCents(-2.5, 'f')).toBe(250);
    expect(u.normalizeOptionalAmountFilterToCents('1.5', 'f')).toBe(150);
  });

  it('rejects empty and non-numeric strings', () => {
    expect(() => u.normalizeOptionalAmountFilterToCents('  ', 'f')).toThrow('f cannot be empty.');
    expect(() => u.normalizeOptionalAmountFilterToCents('abc', 'f')).toThrow('f must be a number.');
    expect(() => u.normalizeOptionalAmountFilterToCents(null, 'f')).toThrow('f must be a number.');
  });
});

describe('normalizeOptionalIdArray', () => {
  it('keeps undefined and rejects non-arrays', () => {
    expect(u.normalizeOptionalIdArray(undefined, 'ids')).toBeUndefined();
    expect(() => u.normalizeOptionalIdArray('1,2', 'ids')).toThrow('ids must be an array.');
  });

  it('validates each entry and reports its index', () => {
    expect(u.normalizeOptionalIdArray([1, '2', 3], 'ids')).toEqual([1, 2, 3]);
    expect(() => u.normalizeOptionalIdArray([1, 0], 'ids')).toThrow(
      'ids[1] must be a positive integer.',
    );
  });

  it('keeps duplicates unless dedupe is requested', () => {
    expect(u.normalizeOptionalIdArray([1, 1, 2], 'ids')).toEqual([1, 1, 2]);
    expect(u.normalizeOptionalIdArray([1, 1, 2], 'ids', { dedupe: true })).toEqual([1, 2]);
  });

  it('accepts an empty array', () => {
    expect(u.normalizeOptionalIdArray([], 'ids')).toEqual([]);
  });
});

describe('normalizeOptionalEnumArray', () => {
  const allowed = new Set(['a', 'b']);

  it('keeps undefined and rejects non-arrays', () => {
    expect(u.normalizeOptionalEnumArray(undefined, 'xs', allowed)).toBeUndefined();
    expect(() => u.normalizeOptionalEnumArray('a', 'xs', allowed)).toThrow('xs must be an array.');
  });

  it('dedupes by default, the opposite default of normalizeOptionalIdArray', () => {
    expect(u.normalizeOptionalEnumArray(['a', 'a', 'b'], 'xs', allowed)).toEqual(['a', 'b']);
    expect(u.normalizeOptionalEnumArray(['a', 'a'], 'xs', allowed, { dedupe: false })).toEqual([
      'a',
      'a',
    ]);
  });

  it('reports the index of an invalid entry', () => {
    expect(() => u.normalizeOptionalEnumArray(['a', 'z'], 'xs', allowed)).toThrow(
      'xs[1] must be one of: a, b.',
    );
    expect(() => u.normalizeOptionalEnumArray(['a', 5], 'xs', allowed)).toThrow(
      'xs[1] must be a string.',
    );
  });
});

describe('normalizeInternalPlanItemId', () => {
  it('returns undefined when options is missing or not a plain object', () => {
    expect(u.normalizeInternalPlanItemId()).toBeUndefined();
    expect(u.normalizeInternalPlanItemId(null)).toBeUndefined();
    expect(u.normalizeInternalPlanItemId([])).toBeUndefined();
    expect(u.normalizeInternalPlanItemId('7')).toBeUndefined();
    expect(u.normalizeInternalPlanItemId({})).toBeUndefined();
  });

  it('validates a supplied plan_item_id', () => {
    expect(u.normalizeInternalPlanItemId({ plan_item_id: 9 })).toBe(9);
    expect(() => u.normalizeInternalPlanItemId({ plan_item_id: 0 })).toThrow(
      'options.plan_item_id must be a positive integer.',
    );
  });
});

describe('normalizeUnixTimestampMilliseconds', () => {
  it('accepts positive integers and numeric strings', () => {
    expect(u.normalizeUnixTimestampMilliseconds(1700000000000, 't')).toBe(1700000000000);
    expect(u.normalizeUnixTimestampMilliseconds('5', 't')).toBe(5);
  });

  it.each([[0], [-1], [1.5], ['abc'], [null], [undefined]])('rejects %j', (value) => {
    expect(() => u.normalizeUnixTimestampMilliseconds(value, 't')).toThrow(
      't must be a Unix timestamp in milliseconds.',
    );
  });
});

describe('normalizeCalendarYear', () => {
  it('defaults to 1..9999 inclusive', () => {
    expect(u.normalizeCalendarYear(1, 'y')).toBe(1);
    expect(u.normalizeCalendarYear(9999, 'y')).toBe(9999);
    expect(() => u.normalizeCalendarYear(0, 'y')).toThrow(
      'y must be an integer between 1 and 9999.',
    );
    expect(() => u.normalizeCalendarYear(10000, 'y')).toThrow();
  });

  it('honours custom inclusive bounds', () => {
    expect(u.normalizeCalendarYear(2000, 'y', { min: 2000, max: 2100 })).toBe(2000);
    expect(u.normalizeCalendarYear(2100, 'y', { min: 2000, max: 2100 })).toBe(2100);
    expect(() => u.normalizeCalendarYear(1999, 'y', { min: 2000, max: 2100 })).toThrow(
      'y must be an integer between 2000 and 2100.',
    );
  });

  it('rejects non-integers', () => {
    expect(() => u.normalizeCalendarYear(2020.5, 'y')).toThrow();
    expect(() => u.normalizeCalendarYear('abc', 'y')).toThrow();
  });
});

describe('extractId / extractString / extractListPayload / pickDefined', () => {
  it('extractId reads a primitive or an object field', () => {
    expect(u.extractId(5)).toBe(5);
    expect(u.extractId('9')).toBe(9);
    expect(u.extractId({ id: 3 })).toBe(3);
    expect(u.extractId({ accountId: 4 }, 'accountId')).toBe(4);
  });

  it('extractId rejects bad shapes', () => {
    expect(() => u.extractId(true)).toThrow('payload must be a plain object.');
    expect(() => u.extractId(null)).toThrow('payload must be a plain object.');
    expect(() => u.extractId({})).toThrow('id must be a positive integer.');
    expect(() => u.extractId('')).toThrow('id must be a positive integer.');
    expect(() => u.extractId({ id: 0 })).toThrow('id must be a positive integer.');
  });

  it('extractString trims and reads a primitive or an object field', () => {
    expect(u.extractString(' a ', 'k')).toBe('a');
    expect(u.extractString({ k: ' b ' }, 'k')).toBe('b');
    expect(() => u.extractString('  ', 'k')).toThrow('k cannot be empty.');
    expect(() => u.extractString({}, 'k')).toThrow('k must be a string.');
    expect(() => u.extractString(5, 'k')).toThrow('payload must be a plain object.');
  });

  it('extractListPayload defaults to empty where/options', () => {
    expect(u.extractListPayload(undefined)).toEqual({ where: {}, options: {} });
    expect(u.extractListPayload(null)).toEqual({ where: {}, options: {} });
    expect(u.extractListPayload({ where: { a: 1 }, options: { b: 2 } })).toEqual({
      where: { a: 1 },
      options: { b: 2 },
    });
    expect(() => u.extractListPayload({ where: [] })).toThrow(
      'payload.where must be a plain object.',
    );
    expect(() => u.extractListPayload({ options: 'x' })).toThrow(
      'payload.options must be a plain object.',
    );
  });

  it('pickDefined drops only undefined, keeping null, 0, false and empty string', () => {
    expect(u.pickDefined({ a: undefined, b: null, c: 0, d: false, e: '', f: 'x' })).toEqual({
      b: null,
      c: 0,
      d: false,
      e: '',
      f: 'x',
    });
  });
});

describe('normalizeWhereOptionsListPayload', () => {
  const config = {
    allowedPayloadFields: new Set(['where', 'options', 'page', 'page_size', 'all']),
  };

  it('returns defaults for undefined and null payloads', () => {
    const expected = { where: {}, options: {}, pagination: { page: 1, page_size: 10 }, all: false };
    expect(u.normalizeWhereOptionsListPayload(undefined, config)).toEqual(expected);
    expect(u.normalizeWhereOptionsListPayload(null, config)).toEqual(expected);
  });

  it('uses configured defaults', () => {
    const result = u.normalizeWhereOptionsListPayload(undefined, {
      ...config,
      defaultPage: 2,
      defaultPageSize: 25,
    });
    expect(result.pagination).toEqual({ page: 2, page_size: 25 });
  });

  it('rejects unknown payload fields and non-object payloads', () => {
    expect(() => u.normalizeWhereOptionsListPayload({ sort: 'x' }, config)).toThrow(
      'Unsupported payload field: "sort"',
    );
    expect(() => u.normalizeWhereOptionsListPayload('x', config)).toThrow(
      'payload must be a plain object.',
    );
    expect(() => u.normalizeWhereOptionsListPayload([], config)).toThrow(
      'payload must be a plain object.',
    );
  });

  it('requires where and options to be plain objects', () => {
    expect(() => u.normalizeWhereOptionsListPayload({ where: [] }, config)).toThrow(
      'payload.where must be a plain object.',
    );
    expect(() => u.normalizeWhereOptionsListPayload({ options: 3 }, config)).toThrow(
      'payload.options must be a plain object.',
    );
  });

  it('validates pagination and enforces the page size cap', () => {
    const ok = u.normalizeWhereOptionsListPayload({ page: '3', page_size: 50 }, config);
    expect(ok.pagination).toEqual({ page: 3, page_size: 50 });

    expect(() => u.normalizeWhereOptionsListPayload({ page: 0 }, config)).toThrow(
      'payload.page must be a positive integer.',
    );
    expect(() => u.normalizeWhereOptionsListPayload({ page_size: 251 }, config)).toThrow(
      'payload.page_size cannot be greater than 250.',
    );
    expect(
      u.normalizeWhereOptionsListPayload({ page_size: 300 }, { ...config, maxPageSize: 500 })
        .pagination.page_size,
    ).toBe(300);
  });

  it('all:true skips pagination entirely, including the cap', () => {
    const result = u.normalizeWhereOptionsListPayload({ all: true, page_size: 99999 }, config);
    expect(result.all).toBe(true);
    expect(result.pagination).toEqual({ page: 1, page_size: 10 });
  });

  it('all accepts 0/1 and rejects other values', () => {
    expect(u.normalizeWhereOptionsListPayload({ all: 1 }, config).all).toBe(true);
    expect(u.normalizeWhereOptionsListPayload({ all: 0 }, config).all).toBe(false);
    expect(() => u.normalizeWhereOptionsListPayload({ all: 'yes' }, config)).toThrow(
      'payload.all must be a boolean or 0/1.',
    );
  });
});

describe('normalizeFiltersListPayload', () => {
  const config = {
    allowedPayloadFields: new Set(['filters', 'page', 'page_size']),
    allowedFilterFields: new Set(['account_id', 'settled']),
  };

  it('returns defaults when the payload is missing', () => {
    expect(u.normalizeFiltersListPayload(undefined, config)).toEqual({
      filters: {},
      pagination: { page: 1, page_size: 10 },
    });
  });

  it('rejects unknown payload and filter keys', () => {
    expect(() => u.normalizeFiltersListPayload({ nope: 1 }, config)).toThrow(
      'Unsupported payload field: "nope"',
    );
    expect(() => u.normalizeFiltersListPayload({ filters: { nope: 1 } }, config)).toThrow(
      'Unsupported payload.filters field: "nope"',
    );
    expect(() => u.normalizeFiltersListPayload({ filters: [] }, config)).toThrow(
      'payload.filters must be a plain object.',
    );
  });

  it('passes valid filters through and paginates', () => {
    expect(
      u.normalizeFiltersListPayload({ filters: { account_id: 3 }, page: 2, page_size: 20 }, config),
    ).toEqual({ filters: { account_id: 3 }, pagination: { page: 2, page_size: 20 } });
  });
});

describe('resolvePaginationWindow', () => {
  it('computes the offset for an in-range page', () => {
    expect(u.resolvePaginationWindow(25, { page: 2, page_size: 10 })).toEqual({
      page: 2,
      page_size: 10,
      offset: 10,
      total_pages: 3,
    });
  });

  it('clamps a page beyond the last one', () => {
    expect(u.resolvePaginationWindow(25, { page: 9, page_size: 10 })).toMatchObject({
      page: 3,
      offset: 20,
    });
  });

  it('treats an empty result as a single page', () => {
    expect(u.resolvePaginationWindow(0, { page: 5, page_size: 10 })).toEqual({
      page: 1,
      page_size: 10,
      offset: 0,
      total_pages: 1,
    });
  });

  it('falls back to defaults on invalid or missing pagination', () => {
    const fallback = { page: 1, page_size: 10, offset: 0, total_pages: 3 };
    expect(u.resolvePaginationWindow(25, { page: -1, page_size: 0 })).toEqual(fallback);
    expect(u.resolvePaginationWindow(25, undefined)).toEqual(fallback);
    expect(u.resolvePaginationWindow(25, { page: 1, page_size: 1.5 })).toEqual(fallback);
  });

  it('puts the last row on the last page for an exact multiple', () => {
    expect(u.resolvePaginationWindow(30, { page: 3, page_size: 10 })).toMatchObject({
      page: 3,
      total_pages: 3,
      offset: 20,
    });
  });
});

describe('executeWhereOptionsListQuery', () => {
  function fakeModel(total, rowsFor) {
    const calls = { count: [], list: [] };
    return {
      calls,
      count(where) {
        calls.count.push(where);
        return total;
      },
      list(where, options) {
        calls.list.push({ where, options });
        return rowsFor(options);
      },
    };
  }

  it('pages with limit/offset derived from the clamped window', () => {
    const model = fakeModel(25, () => [{ id: 21 }]);
    const result = u.executeWhereOptionsListQuery(model, {
      where: { a: 1 },
      listOptions: { order: 'x' },
      pagination: { page: 9, page_size: 10 },
      all: false,
    });

    expect(model.calls.count).toEqual([{ a: 1 }]);
    expect(model.calls.list[0].options).toEqual({ order: 'x', limit: 10, offset: 20 });
    expect(result).toEqual({ rows: [{ id: 21 }], total: 25, page: 3, page_size: 10 });
  });

  it('all:true lists without limit or offset and sizes the page to the rows', () => {
    const model = fakeModel(3, () => [{ id: 1 }, { id: 2 }, { id: 3 }]);
    const result = u.executeWhereOptionsListQuery(model, {
      where: {},
      listOptions: { order: 'x' },
      pagination: { page: 5, page_size: 2 },
      all: true,
    });

    expect(model.calls.list[0].options).toEqual({ order: 'x' });
    expect(result).toEqual({
      rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
      total: 3,
      page: 1,
      page_size: 3,
    });
  });

  it('all:true on an empty result reports the default page size', () => {
    const model = fakeModel(0, () => []);
    const result = u.executeWhereOptionsListQuery(model, {
      where: {},
      listOptions: {},
      pagination: { page: 1, page_size: 10 },
      all: true,
    });
    expect(result).toEqual({ rows: [], total: 0, page: 1, page_size: 10 });
  });
});

describe('normalizeDateAmountSettledFilters', () => {
  it('leaves every field undefined for empty filters', () => {
    expect(u.normalizeDateAmountSettledFilters({})).toEqual({
      date_from: undefined,
      date_to: undefined,
      amount_from: undefined,
      amount_to: undefined,
      settled: undefined,
    });
  });

  it('normalizes timestamps, absolute cents and the settled flag', () => {
    expect(
      u.normalizeDateAmountSettledFilters({
        date_from: 1000,
        date_to: '2000',
        amount_from: -1.5,
        amount_to: '2.25',
        settled: false,
      }),
    ).toEqual({ date_from: 1000, date_to: 2000, amount_from: 150, amount_to: 225, settled: 0 });
  });

  it('prefixes error labels', () => {
    expect(() => u.normalizeDateAmountSettledFilters({ date_from: -1 }, 'filters')).toThrow(
      'filters.date_from must be a Unix timestamp in milliseconds.',
    );
    expect(() => u.normalizeDateAmountSettledFilters({ settled: 'no' })).toThrow(
      'payload.filters.settled must be a boolean or 0/1.',
    );
  });
});

describe('nowUnixTimestampMilliseconds', () => {
  it('returns an integer close to Date.now()', () => {
    const before = Date.now();
    const value = u.nowUnixTimestampMilliseconds();
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(Date.now());
  });
});
