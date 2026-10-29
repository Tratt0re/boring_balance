import { describe, expect, it } from 'vitest';

import { loadElectronModule } from './helpers/electron-db.js';

// Single-digit months, days, hours, minutes and seconds must be padded with a zero. Both the file
// names of backups and the dates shown in exports rely on it.

const { formatUnixTimestampMillisecondsToDate, pad2 } = loadElectronModule(
  'electron/utils/date-utils.js',
);
const { formatTimestampForFilename } = loadElectronModule('electron/utils/file-utils.js');

// Local time, so the result does not depend on the machine's time zone.
const earlyMorning = new Date(2026, 0, 2, 3, 4, 5).getTime();
const lateEvening = new Date(2026, 10, 23, 21, 45, 59).getTime();

describe('pad2', () => {
  it('pads a single digit and leaves two digits alone', () => {
    expect(pad2(7)).toBe('07');
    expect(pad2(0)).toBe('00');
    expect(pad2(12)).toBe('12');
  });
});

describe('formatTimestampForFilename', () => {
  it('pads every part of an early date', () => {
    expect(formatTimestampForFilename(earlyMorning)).toBe('20260102-030405');
  });

  it('keeps two-digit parts as they are', () => {
    expect(formatTimestampForFilename(lateEvening)).toBe('20261123-214559');
  });
});

describe('formatUnixTimestampMillisecondsToDate', () => {
  it('pads month and day in both formats', () => {
    expect(formatUnixTimestampMillisecondsToDate(earlyMorning, { format: 'YYYY-MM-DD' })).toBe(
      '2026-01-02',
    );
    expect(formatUnixTimestampMillisecondsToDate(earlyMorning, { format: 'DD-MM-YYYY' })).toBe(
      '02-01-2026',
    );
  });
});
