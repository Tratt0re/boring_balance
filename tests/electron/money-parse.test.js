import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { parseDecimalToCents } = require('../../electron/utils/money-parse.js');

describe('parseDecimalToCents', () => {
  describe('valid input', () => {
    it.each([
      ['12.34', 1234],
      ['12,34', 1234],
      ['12', 1200],
      ['12.5', 1250],
      ['0.01', 1],
      ['0', 0],
      ['+5', 500],
      [' 7 ', 700],
      [12.3, 1230],
      [5, 500],
    ])('parses %j as %i cents', (input, expected) => {
      expect(parseDecimalToCents(input, 'amount')).toBe(expected);
    });

    it('accepts negative values only when allowNegative is set', () => {
      expect(parseDecimalToCents('-5.00', 'amount', { allowNegative: true })).toBe(-500);
      expect(() => parseDecimalToCents('-5.00', 'amount')).toThrow('amount must not be negative.');
    });
  });

  describe('invalid input', () => {
    it.each([
      ['', 'amount cannot be empty.'],
      ['   ', 'amount cannot be empty.'],
      ['1 000', 'amount must not contain spaces or thousands separators.'],
      ['1.234', 'amount must be a valid decimal number with up to 2 decimal places.'],
      ['1,234.56', 'amount must be a valid decimal number with up to 2 decimal places.'],
      ['.5', 'amount must be a valid decimal number with up to 2 decimal places.'],
      ['5.', 'amount must be a valid decimal number with up to 2 decimal places.'],
      ['abc', 'amount must be a valid decimal number with up to 2 decimal places.'],
      ['1e3', 'amount must be a valid decimal number with up to 2 decimal places.'],
    ])('rejects %j', (input, message) => {
      expect(() => parseDecimalToCents(input, 'amount')).toThrow(message);
    });

    it.each([[NaN], [Infinity], [-Infinity]])('rejects non-finite number %s', (input) => {
      expect(() => parseDecimalToCents(input, 'amount')).toThrow('amount must be a finite number.');
    });

    it.each([[null], [undefined], [{}], [[]], [true]])('rejects non string/number %j', (input) => {
      expect(() => parseDecimalToCents(input, 'amount')).toThrow(
        'amount must be a string or number.',
      );
    });

    it('rejects float noise from number inputs instead of rounding it', () => {
      // String(0.1 + 0.2) is "0.30000000000000004": the strict pattern refuses it.
      expect(() => parseDecimalToCents(0.1 + 0.2, 'amount')).toThrow('up to 2 decimal places');
      expect(() => parseDecimalToCents(1.005, 'amount')).toThrow('up to 2 decimal places');
    });

    it('uses the supplied label in error messages', () => {
      expect(() => parseDecimalToCents('x', 'payload.amount')).toThrow(/^payload\.amount /);
    });
  });

  describe('range and sign options', () => {
    it('accepts the largest safe integer worth of cents and rejects one more', () => {
      expect(parseDecimalToCents('90071992547409.91', 'amount')).toBe(Number.MAX_SAFE_INTEGER);
      expect(() => parseDecimalToCents('90071992547409.92', 'amount')).toThrow(
        'amount is too large.',
      );
    });

    it('rejects values below the smallest safe integer', () => {
      expect(parseDecimalToCents('-90071992547409.91', 'amount', { allowNegative: true })).toBe(
        Number.MIN_SAFE_INTEGER,
      );
      expect(() =>
        parseDecimalToCents('-90071992547409.92', 'amount', { allowNegative: true }),
      ).toThrow('amount is too large.');
    });

    it('requirePositive rejects zero but plain parsing accepts it', () => {
      expect(parseDecimalToCents('0', 'amount')).toBe(0);
      expect(() => parseDecimalToCents('0', 'amount', { requirePositive: true })).toThrow(
        'amount must be a positive number.',
      );
      expect(parseDecimalToCents('0.01', 'amount', { requirePositive: true })).toBe(1);
    });
  });
});
