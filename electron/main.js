const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const {
  closeDatabase,
  createDatabase,
  initSchema,
  isFirstStart,
  markFirstStartCompleted,
  runMigrations,
} = require('./database');
const { backupController } = require('./controllers');
const { registerIpcHandlers } = require('./ipc');
const { createWindow } = require('./window');

const APP_NAME = 'Expense Tracker';
const APP_STORAGE_DIR_NAME = 'expense_tracker';
let beforeQuitHandled = false;

app.setName(APP_NAME);
app.setAboutPanelOptions({
  applicationName: APP_NAME,
});
app.setPath('userData', path.join(app.getPath('appData'), APP_STORAGE_DIR_NAME));

app.whenReady()
  .then(() => {
    const database = createDatabase();
    const firstStart = isFirstStart();

    if (!firstStart) {
      console.log('[electron] Schema initialization skipped - app already initialized');
    } else {
      initSchema(database);
    }

    runMigrations(database);

    if (firstStart) {
      markFirstStartCompleted();
    }

    registerIpcHandlers();
    backupController.init();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  })
  .catch((error) => {
    console.error('[electron] Failed to start app:', error);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (beforeQuitHandled) {
    backupController.dispose();
    closeDatabase();
    return;
  }

  beforeQuitHandled = true;
  event.preventDefault();

  Promise.resolve()
    .then(() => backupController.onAppBeforeQuit())
    .catch((error) => {
      console.error('[electron] Backup before quit failed:', error);
    })
    .finally(() => {
      backupController.dispose();
      closeDatabase();
      app.quit();
    });
});
