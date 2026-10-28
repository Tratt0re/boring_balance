// Dev-only bridge that lets a normal browser (e.g. Chrome DevTools) drive the built Angular app
// without Electron. It serves dist/ and exposes the app's REAL IPC handlers (controllers, models,
// SQL) over HTTP, backed by a throwaway SQLite database seeded with sample data. The page gets a
// `window.electronAPI` with the same shape as electron/preload.js.
//
//   npm run build && npm run dev:bridge           -> http://127.0.0.1:4300
//
// Never packaged (build.files excludes scripts/), listens on loopback only, and rejects requests
// whose Host or Origin is not the bridge itself, so other web pages cannot reach it.
//
// Control endpoints (POST JSON):
//   /__bridge/fail    { pattern: "update:", message: "offline" }   fail matching channels; {} clears
//   /__bridge/reset   {}                                           recreate and re-seed the database
//   /__bridge/dialog  { canceled: true }                           make native dialogs report "canceled"
//   /__bridge/update  { updateAvailable: true, latestVersion }     canned result for the update check
//   GET /__bridge/opened                                           URLs passed to shell.openExternal
//   GET /__bridge/calls                                            channels invoked so far
//   POST /__bridge/emit { channel, payload }                       push an IPC event to the page

const path = require('node:path');
const { spawn } = require('node:child_process');

// better-sqlite3 is built for Electron's runtime, so run under Electron's Node.
if (process.env.ELECTRON_RUN_AS_NODE !== '1') {
  const child = spawn(require('electron'), [__filename, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
  }
} else {
  require('./dev-ipc-bridge.server.js');
}
