import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadElectronModule } from './helpers/electron-db.js';

// An import file comes from the user's disk, but it can still be huge or built to exhaust memory.
// The workbook is refused by size before it is parsed, and a sheet with too many rows is refused
// before any row is read.

const excelUtils = loadElectronModule('electron/utils/excel-utils.js');
const { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS_PER_SHEET } = excelUtils;
const TEMPLATE = path.resolve('electron/files/boring-balance-import-template.xlsx');

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-excel-limits-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function sparseFile(name, bytes) {
  const filePath = path.join(dir, name);
  const fd = fs.openSync(filePath, 'w');
  fs.ftruncateSync(fd, bytes); // sparse file, no real disk use
  fs.closeSync(fd);
  return filePath;
}

describe('limits', () => {
  it('are sensible numbers', () => {
    expect(MAX_IMPORT_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_IMPORT_ROWS_PER_SHEET).toBe(20000);
  });
});

describe('readWorkbookFromFile', () => {
  it('still reads the shipped template', async () => {
    const workbook = await excelUtils.readWorkbookFromFile(TEMPLATE);
    expect(workbook.worksheets.length).toBeGreaterThan(0);
  });

  it('refuses a file over the size cap without parsing it', async () => {
    const big = sparseFile('big.xlsx', MAX_IMPORT_FILE_BYTES + 1);

    await expect(excelUtils.readWorkbookFromFile(big)).rejects.toThrow(/too large/i);
  });

  it('does not refuse a file of exactly the cap size for its size', async () => {
    const edge = sparseFile('edge.xlsx', MAX_IMPORT_FILE_BYTES);

    // Not a real workbook, so parsing fails, but not because of the size.
    const error = await excelUtils.readWorkbookFromFile(edge).catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toMatch(/too large/i);
  });

  it('trims the path before using it', async () => {
    const workbook = await excelUtils.readWorkbookFromFile(`  ${TEMPLATE}  `);
    expect(workbook.worksheets.length).toBeGreaterThan(0);
  });

  it('keeps refusing an empty path', async () => {
    await expect(excelUtils.readWorkbookFromFile('  ')).rejects.toThrow('non-empty string');
  });
});

describe('mapWorksheetRows', () => {
  function fakeSheet(rowCount) {
    const sheet = {
      rowCount,
      visited: 0,
      eachRow: (_options, callback) => {
        for (let rowNumber = 1; rowNumber <= 3; rowNumber += 1) {
          sheet.visited += 1;
          callback({ getCell: () => ({ value: 'x', text: 'x' }) }, rowNumber);
        }
      },
    };
    return sheet;
  }

  it('maps a sheet at the row cap (header row included)', () => {
    const rows = excelUtils.mapWorksheetRows(fakeSheet(MAX_IMPORT_ROWS_PER_SHEET + 1), { a: 1 });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('refuses a sheet over the row cap before reading any row', () => {
    const sheet = fakeSheet(MAX_IMPORT_ROWS_PER_SHEET + 2);

    expect(() => excelUtils.mapWorksheetRows(sheet, { a: 1 })).toThrow(/too many rows/i);
    expect(sheet.visited).toBe(0);
  });
});
