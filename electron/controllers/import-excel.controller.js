const { app, dialog } = require('electron');
const path = require('node:path');
const { getDatabase } = require('../database');
const { importExcelModel } = require('../models');
const { createAuthorizedPath } = require('../utils/authorized-path');

const DEFAULT_FILE_FILTERS = Object.freeze([
  {
    name: 'Excel Workbook',
    extensions: ['xlsx'],
  },
]);

// The one workbook the user picked. validate and commit only read that file, because the renderer
// could otherwise ask the main process to open any file it can name.
const pickedImportFile = createAuthorizedPath();

function createImportError(code, message, options = {}) {
  return {
    sheet: options.sheet ?? 'workbook',
    row: Number.isInteger(options.row) && options.row > 0 ? options.row : 1,
    ...(typeof options.column === 'string' && options.column.trim().length > 0
      ? { column: options.column.trim() }
      : {}),
    code,
    message,
  };
}

function toValidationResponse(result) {
  if (!result?.ok) {
    return {
      ok: false,
      errors: Array.isArray(result?.errors) ? result.errors : [],
    };
  }

  return {
    ok: true,
    errors: [],
    ...(result.summary ? { summary: result.summary } : {}),
  };
}

function resolveDefaultImportPath() {
  return app.getPath('documents');
}

function normalizeSelectedFilePath(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return null;
  }

  const selectedPath = typeof filePaths[0] === 'string' ? filePaths[0].trim() : '';
  if (selectedPath.length === 0) {
    return null;
  }

  return path.resolve(selectedPath);
}

async function selectFile() {
  const result = await dialog.showOpenDialog({
    title: 'Select import workbook',
    defaultPath: resolveDefaultImportPath(),
    filters: DEFAULT_FILE_FILTERS,
    properties: ['openFile'],
  });

  const filePath = result.canceled ? null : normalizeSelectedFilePath(result.filePaths);
  if (!pickedImportFile.authorize(filePath)) {
    return null;
  }

  return { filePath };
}

function notSelectedResponse() {
  return {
    ok: false,
    errors: [
      createImportError(
        'FILE_NOT_SELECTED',
        'Select the workbook with the file picker before validating or importing it.',
      ),
    ],
  };
}

async function validate(filePath) {
  if (!pickedImportFile.isAuthorized(filePath)) {
    return notSelectedResponse();
  }

  const database = getDatabase();
  const validationResult = await importExcelModel.prepareImport(filePath, database);
  return toValidationResponse(validationResult);
}

async function commit(filePath) {
  if (!pickedImportFile.isAuthorized(filePath)) {
    return notSelectedResponse();
  }

  const database = getDatabase();
  const validationResult = await importExcelModel.prepareImport(filePath, database);
  if (!validationResult.ok) {
    return toValidationResponse(validationResult);
  }

  try {
    const result = importExcelModel.executeImport(database, validationResult.data);

    return {
      ok: true,
      result,
    };
  } catch (error) {
    return {
      ok: false,
      errors: [
        createImportError(
          'IMPORT_FAILED',
          error instanceof Error ? error.message : String(error),
        ),
      ],
    };
  }
}

module.exports = {
  commit,
  selectFile,
  validate,
};
