const ExcelJS = require('exceljs');

function ensureWorkbook(workbook) {
  if (!workbook || typeof workbook.addWorksheet !== 'function' || !workbook.xlsx) {
    throw new Error('workbook must be a valid ExcelJS workbook instance.');
  }

  return workbook;
}

function normalizeColumnKeys(columnKeys) {
  if (!Array.isArray(columnKeys) || columnKeys.length === 0) {
    throw new Error('columnKeys must be a non-empty array.');
  }

  return columnKeys.map((columnKey, index) => {
    if (typeof columnKey !== 'string' || columnKey.trim().length === 0) {
      throw new Error(`columnKeys[${index}] must be a non-empty string.`);
    }

    return columnKey.trim();
  });
}

function createWorkbook(options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator =
    typeof options.creator === 'string' && options.creator.trim().length > 0 ? options.creator.trim() : 'Boring Balance';
  workbook.created = new Date();

  return workbook;
}

function addWorksheetFromObjects(workbook, sheetName, columnKeys, rows = []) {
  const normalizedWorkbook = ensureWorkbook(workbook);
  if (typeof sheetName !== 'string' || sheetName.trim().length === 0) {
    throw new Error('sheetName must be a non-empty string.');
  }

  if (!Array.isArray(rows)) {
    throw new Error('rows must be an array.');
  }

  const normalizedColumnKeys = normalizeColumnKeys(columnKeys);
  const worksheet = normalizedWorkbook.addWorksheet(sheetName.trim());

  worksheet.addRow(normalizedColumnKeys);

  rows.forEach((row, rowIndex) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`rows[${rowIndex}] must be a plain object.`);
    }

    worksheet.addRow(normalizedColumnKeys.map((columnKey) => row[columnKey]));
  });

  return worksheet;
}

async function writeWorkbookToBuffer(workbook) {
  const normalizedWorkbook = ensureWorkbook(workbook);
  const content = await normalizedWorkbook.xlsx.writeBuffer();

  if (Buffer.isBuffer(content)) {
    return content;
  }

  if (content instanceof Uint8Array) {
    return Buffer.from(content);
  }

  return Buffer.from(content);
}

module.exports = {
  addWorksheetFromObjects,
  createWorkbook,
  writeWorkbookToBuffer,
};
