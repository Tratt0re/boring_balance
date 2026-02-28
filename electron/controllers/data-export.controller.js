const { app, dialog } = require('electron');
const path = require('node:path');
const { dataExportModel } = require('../models');
const { formatTimestampForFilename, safeWriteFileAtomic } = require('../utils/file-utils');

const EXPORT_FILE_PREFIX = 'boring-balance-export-';
const XLSX_EXTENSION = '.xlsx';

function resolveDefaultExportPath() {
  return path.join(
    app.getPath('documents'),
    `${EXPORT_FILE_PREFIX}${formatTimestampForFilename()}${XLSX_EXTENSION}`,
  );
}

function ensureXlsxExtension(filePath) {
  const normalizedFilePath = filePath.trim();
  if (path.extname(normalizedFilePath).toLowerCase() === XLSX_EXTENSION) {
    return normalizedFilePath;
  }

  return `${normalizedFilePath}${XLSX_EXTENSION}`;
}

async function exportXlsx() {
  const result = await dialog.showSaveDialog({
    title: 'Export data as XLSX',
    defaultPath: resolveDefaultExportPath(),
    filters: [
      {
        name: 'Excel Workbook',
        extensions: ['xlsx'],
      },
    ],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  const filePath = ensureXlsxExtension(result.filePath);
  const workbookBuffer = await dataExportModel.buildExportWorkbook();
  safeWriteFileAtomic(filePath, workbookBuffer);

  return {
    filePath,
    fileName: path.basename(filePath),
  };
}

module.exports = {
  exportXlsx,
};
