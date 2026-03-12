const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const isMac = process.platform === 'darwin';

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:4200';
const RENDERER_BUILD_SEGMENTS = ['dist', 'boringbalance', 'browser'];
const PRODUCTION_MODE_FLAGS = new Set(['--prod', '--production']);
const openWindows = new Set();

function resolveAppPath(...segments) {
  return path.join(app.getAppPath(), ...segments);
}

function resolveRendererIndexPath() {
  return resolveAppPath(...RENDERER_BUILD_SEGMENTS, 'index.html');
}

function resolvePreloadPath() {
  const preloadPath = resolveAppPath('electron', 'preload.bundle.cjs');

  if (!fs.existsSync(preloadPath)) {
    throw new Error(`Preload bundle not found at ${preloadPath}. Run "npm run build:preload".`);
  }

  return preloadPath;
}

function resolveAppIconPath(isDev) {
  const candidates = isDev
    ? [
        resolveAppPath('src', 'assetts', 'icon', 'bb_ico_1024.png'),
        resolveAppPath(...RENDERER_BUILD_SEGMENTS, 'assetts', 'icon', 'bb_ico_1024.png'),
      ]
    : [resolveAppPath(...RENDERER_BUILD_SEGMENTS, 'assetts', 'icon', 'bb_ico_1024.png')];

  for (const iconPath of candidates) {
    if (fs.existsSync(iconPath)) {
      return iconPath;
    }
  }

  return null;
}

function initMainWindow(isDev, iconPath = null) {
  const windowOptions = {
    width: 1200,
    height: 800,
    minWidth: 950,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolvePreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: isDev,
    },
  };

  if (iconPath) {
    windowOptions.icon = iconPath;
  }

  return new BrowserWindow(windowOptions);
}

function emitFullscreenState(mainWindow) {
  if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('window:fullscreenChanged', {
    isFullscreen: mainWindow.isFullScreen(),
  });
}

function registerWindowLifecycle(mainWindow) {
  openWindows.add(mainWindow);

  // mainWindow.on('focus', () => {});
  // mainWindow.on('blur', () => {});
  // mainWindow.on('close', (event) => {});

  mainWindow.webContents.on('did-finish-load', () => {
    emitFullscreenState(mainWindow);
  });

  mainWindow.on('enter-full-screen', () => {
    emitFullscreenState(mainWindow);
  });

  mainWindow.on('leave-full-screen', () => {
    emitFullscreenState(mainWindow);
  });

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

function isProductionCliMode() {
  return process.argv.some((flag) => PRODUCTION_MODE_FLAGS.has(flag));
}

function createWindow() {
  const isDev = !app.isPackaged && !isProductionCliMode();
  const iconPath = resolveAppIconPath(isDev);

  if (isMac && iconPath) {
    app.dock.setIcon(iconPath);
  }

  const mainWindow = initMainWindow(isDev, iconPath);
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
