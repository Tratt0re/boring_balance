const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const isMac = process.platform === 'darwin';

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:4200';
const openWindows = new Set();

function resolveRendererIndexPath() {
  return path.join(__dirname, '..', 'dist', 'expense_tracker', 'browser', 'index.html');
}

function resolvePreloadPath() {
  const preloadPath = path.join(__dirname, 'preload.bundle.cjs');

  if (!fs.existsSync(preloadPath)) {
    throw new Error(`Preload bundle not found at ${preloadPath}. Run "npm run build:preload".`);
  }

  return preloadPath;
}

function initMainWindow(isDev) {
  return new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 950,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? {} : { titleBarOverlay: true }),
    webPreferences: {
      preload: resolvePreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: isDev,
    },
  });
}

function registerWindowLifecycle(mainWindow) {
  openWindows.add(mainWindow);

  // mainWindow.on('focus', () => {});
  // mainWindow.on('blur', () => {});
  // mainWindow.on('close', (event) => {});

  mainWindow.on('closed', () => {
    openWindows.delete(mainWindow);
  });
}

function registerNavigationGuards(mainWindow, isDev) {
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
}

function loadWindowContent(mainWindow, isDev) {
  if (isDev) {
    console.log(`[electron] DEV mode -> ${DEV_SERVER_URL}`);
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  const indexPath = resolveRendererIndexPath();

  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `Renderer build not found at ${indexPath}. Run "npm run build:web" before starting Electron in production mode.`,
    );
  }

  console.log('[electron] PROD mode ->', indexPath);
  mainWindow.loadFile(indexPath);
}

function createWindow() {
  const isDev = !app.isPackaged;
  const mainWindow = initMainWindow(isDev);
  registerWindowLifecycle(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  registerNavigationGuards(mainWindow, isDev);
  loadWindowContent(mainWindow, isDev);

  return mainWindow;
}

module.exports = {
  createWindow,
  initMainWindow,
};
