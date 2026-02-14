const { app, BrowserWindow } = require('electron');
const {
  closeDatabase,
  createDatabase,
  initSchema,
  isInitializationCompleted,
  markInitializationCompleted,
} = require('./database');
const { registerIpcHandlers } = require('./ipc');
const { createWindow } = require('./window');

app.whenReady()
  .then(() => {
    app.setName('Expense Tracker');

    const database = createDatabase();

    if (isInitializationCompleted()) {
      console.log('[electron] Schema initialization skipped (already completed).');
    } else {
      initSchema(database);
      markInitializationCompleted();
    }

    registerIpcHandlers();
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

app.on('before-quit', () => {
  closeDatabase();
});
