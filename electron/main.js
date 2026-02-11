const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:4200';
let mainWindow = null;

function resolveRendererIndexPath() {
  return path.join(__dirname, '..', 'dist', 'expense_tracker', 'browser', 'index.html');
}

function createWindow() {
  const isDev = !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: isDev,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const sameAppNavigation = isDev ? url.startsWith(DEV_SERVER_URL) : url.startsWith('file://');
    if (sameAppNavigation) {
      return;
    }

    event.preventDefault();
    void shell.openExternal(url);
  });

  if (isDev) {
    console.log(`[electron] DEV mode -> ${DEV_SERVER_URL}`);
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = resolveRendererIndexPath();

    if (!fs.existsSync(indexPath)) {
      throw new Error(
        `Renderer build not found at ${indexPath}. Run "npm run build:web" before starting Electron in production mode.`,
      );
    }

    console.log('[electron] PROD mode ->', indexPath);
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady()
  .then(() => {
    app.setName('Expense Tracker');
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
