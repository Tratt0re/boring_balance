import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { parseDdMmYyyyToUnixMilliseconds } = require('../../electron/utils/date-parse.js');

describe('parseDdMmYyyyToUnixMilliseconds', () => {
  describe('valid input', () => {
    it('returns local midnight for the given calendar day', () => {
      const value = parseDdMmYyyyToUnixMilliseconds('15/03/2024', 'date');
      expect(value).toBe(new Date(2024, 2, 15, 0, 0, 0, 0).getTime());

      const date = new Date(value);
      expect([
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
        date.getMilliseconds(),
      ]).toEqual([0, 0, 0, 0]);
    });

    it('trims surrounding whitespace', () => {
      expect(parseDdMmYyyyToUnixMilliseconds(' 01/01/2000 ', 'date')).toBe(
        new Date(2000, 0, 1).getTime(),
      );
    });

    it('accepts a leap day only in leap years', () => {
      expect(parseDdMmYyyyToUnixMilliseconds('29/02/2024', 'date')).toBe(
        new Date(2024, 1, 29).getTime(),
      );
      expect(parseDdMmYyyyToUnixMilliseconds('29/02/2000', 'date')).toBe(
        new Date(2000, 1, 29).getTime(),
      );
    });

    it('accepts the boundary years 1900 and 2100', () => {
      expect(parseDdMmYyyyToUnixMilliseconds('01/01/1900', 'date')).toBe(
        new Date(1900, 0, 1).getTime(),
      );
      expect(parseDdMmYyyyToUnixMilliseconds('31/12/2100', 'date')).toBe(
        new Date(2100, 11, 31).getTime(),
      );
    });
  });

  describe('invalid calendar dates', () => {
    it.each([
      ['29/02/2023', 'must be a valid calendar date'],
      ['29/02/1900', 'must be a valid calendar date'],
      ['31/04/2024', 'must be a valid calendar date'],
      ['31/06/2024', 'must be a valid calendar date'],
    ])('rejects %s', (input, message) => {
      expect(() => parseDdMmYyyyToUnixMilliseconds(input, 'date')).toThrow(message);
    });
  });

  describe('range checks', () => {
    it.each([
      ['01/01/1899', 'date year must be between 1900 and 2100.'],
      ['01/01/2101', 'date year must be between 1900 and 2100.'],
      ['01/00/2024', 'date month must be between 1 and 12.'],
      ['01/13/2024', 'date month must be between 1 and 12.'],
      ['00/01/2024', 'date day must be between 1 and 31.'],
      ['32/01/2024', 'date day must be between 1 and 31.'],
    ])('rejects %s', (input, message) => {
      expect(() => parseDdMmYyyyToUnixMilliseconds(input, 'date')).toThrow(message);
    });
  });

  describe('format and type checks', () => {
    it.each([['1/1/2024'], ['2024-01-01'], ['01-01-2024'], ['01/01/24'], ['aa/bb/cccc']])(
      'rejects malformed string %j',
      (input) => {
        expect(() => parseDdMmYyyyToUnixMilliseconds(input, 'date')).toThrow(
          'date must be in dd/mm/yyyy format.',
        );
      },
    );

    it.each([[''], ['   ']])('rejects empty string %j', (input) => {
      expect(() => parseDdMmYyyyToUnixMilliseconds(input, 'date')).toThrow('date cannot be empty.');
    });

    it.each([[null], [undefined], [20240101], [new Date(2024, 0, 1)]])(
      'rejects non-string %j',
      (input) => {
        expect(() => parseDdMmYyyyToUnixMilliseconds(input, 'date')).toThrow(
          'date must be a string.',
        );
      },
    );

    it('uses the supplied label in error messages', () => {
      expect(() => parseDdMmYyyyToUnixMilliseconds('x', 'row.date')).toThrow(/^row\.date /);
    });
  });
});
