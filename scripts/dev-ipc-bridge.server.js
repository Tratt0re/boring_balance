// Server half of the dev IPC bridge. Started by scripts/dev-ipc-bridge.js under Electron's Node.
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const PORT = Number(argValue('--port', 4300));
const HOST = '127.0.0.1';
const DIST_DIR = path.resolve(projectRoot, argValue('--dist', 'dist/boringbalance/browser'));
const packageJson = require(path.join(projectRoot, 'package.json'));

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-bridge-'));
const state = {
  failPattern: null,
  failMessage: 'Injected failure',
  dialogCanceled: false,
  update: {
    updateAvailable: false,
    currentVersion: packageJson.version,
    latestVersion: null,
    releaseUrl: null,
    popupDismissedForThisVersion: false,
  },
  opened: [],
  calls: [],
};
const eventClients = new Set();

function pushEvent(channel, payload) {
  const frame = `data: ${JSON.stringify({ channel, payload })}\n\n`;
  for (const client of eventClients) {
    client.write(frame);
  }
}

// ---- Electron stand-in --------------------------------------------------------------------------
const fakeWindow = {
  isDestroyed: () => false,
  webContents: { isDestroyed: () => false, send: pushEvent },
};

function makeDialogResult(options = {}) {
  if (state.dialogCanceled) {
    return { canceled: true, filePaths: [] };
  }
  if ((options.properties ?? []).includes('openDirectory')) {
    const folder = path.join(userDataDir, 'picked-folder');
    fs.mkdirSync(folder, { recursive: true });
    return { canceled: false, filePaths: [folder] };
  }
  return {
    canceled: false,
    filePaths: [path.join(projectRoot, 'electron', 'files', 'boring-balance-import-template.xlsx')],
  };
}

const electronStub = {
  app: {
    isPackaged: false,
    getPath: (name) => (name === 'documents' ? path.join(userDataDir, 'documents') : userDataDir),
    getAppPath: () => projectRoot,
    getVersion: () => packageJson.version,
    getName: () => 'Boring Balance',
    on: () => {},
    whenReady: () => Promise.resolve(),
    quit: () => {},
  },
  BrowserWindow: { getAllWindows: () => [fakeWindow] },
  dialog: {
    showOpenDialog: async (options) => makeDialogResult(options),
    showSaveDialog: async () =>
      state.dialogCanceled
        ? { canceled: true, filePath: undefined }
        : { canceled: false, filePath: path.join(userDataDir, 'export.xlsx') },
  },
  shell: {
    openExternal: async (url) => {
      state.opened.push(String(url));
    },
  },
  ipcMain: { handle: () => {} },
};

const electronModulePath = require.resolve('electron');
require.cache[electronModulePath] = {
  id: electronModulePath,
  filename: electronModulePath,
  loaded: true,
  exports: electronStub,
};

// ---- Database and handlers ----------------------------------------------------------------------
const database = require(path.join(projectRoot, 'electron', 'database'));
const { CHANNELS } = require(path.join(projectRoot, 'electron', 'ipc', 'channels'));
const { IPC_HANDLERS } = require(path.join(projectRoot, 'electron', 'ipc', 'handlers'));

const handlers = { ...IPC_HANDLERS };
handlers[CHANNELS.update.check] = async () => ({ ...state.update });
handlers[CHANNELS.update.forceCheck] = async () => ({ ...state.update });

function openFreshDatabase() {
  database.closeDatabase();
  fs.rmSync(path.join(userDataDir, 'data'), { recursive: true, force: true });
  const connection = database.createDatabase();
  database.initSchema(connection);
  database.runMigrations(connection);
  database.markFirstStartCompleted();
  return connection;
}

const call = (channel, payload) => handlers[channel](payload);

async function seed() {
  const now = new Date();
  const at = (monthsAgo, dayOfMonth) =>
    new Date(now.getFullYear(), now.getMonth() - monthsAgo, dayOfMonth, 12).getTime();

  const account = async (name, type) =>
    (await call(CHANNELS.accounts.create, { name, type, description: `${name} account` })).id;
  const cash = await account('Cash', 'cash');
  const bank = await account('Bank', 'bank');
  const savings = await account('Savings', 'savings');
  const broker = await account('Broker', 'brokerage');
  const card = await account('Credit card', 'credit');

  const category = async (name, type) =>
    (await call(CHANNELS.categories.create, { name, type })).id;
  const salary = await category('Salary', 'income');
  const groceries = await category('Groceries', 'expense');
  const rent = await category('Rent', 'expense');
  const leisure = await category('Leisure', 'expense');

  for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo -= 1) {
    const add = (account_id, category_id, amount, description, dayOfMonth, settled = true) =>
      call(CHANNELS.transactions.create, {
        occurred_at: at(monthsAgo, dayOfMonth),
        account_id,
        category_id,
        amount,
        description,
        settled,
      });
    await add(bank, salary, 2800, 'Monthly salary', 1);
    await add(bank, rent, -950, 'Rent', 3);
    await add(card, groceries, -120 - monthsAgo * 7, 'Supermarket', 8);
    await add(cash, groceries, -45.5, 'Market', 15);
    await add(card, leisure, -60 + monthsAgo * 3, 'Cinema and dinner', 20);
    await add(bank, leisure, -25, 'Subscription', 25, monthsAgo !== 0);
  }

  for (const monthsAgo of [1, 0]) {
    await call(CHANNELS.transactions.createTransfer, {
      occurred_at: at(monthsAgo, 5),
      from_account_id: bank,
      to_account_id: savings,
      amount: 400,
      description: 'Monthly savings',
    });
  }

  for (const [monthsAgo, valueCents] of [
    [2, 1250000],
    [0, 1385050],
  ]) {
    await call(CHANNELS.accountValuations.create, {
      account_id: broker,
      valued_at: at(monthsAgo, 28),
      value_cents: valueCents,
      source: 'manual',
    });
  }

  await call(CHANNELS.budgets.create, { category_id: groceries, amount_cents: 40000 });
  await call(CHANNELS.budgets.create, { category_id: leisure, amount_cents: 15000 });

  await call(CHANNELS.planItems.create, {
    title: 'Gym membership',
    type: 'transaction',
    template_json: {
      amount_cents: -2999,
      account_id: bank,
      category_id: leisure,
      description: 'Gym',
    },
    rule_json: { start_date: at(0, 10), count: 6, frequency: { unit: 'month', interval: 1 } },
    create_and_run: true,
  });
}

async function resetAndSeed() {
  const originalLog = console.log;
  console.log = () => {};
  try {
    openFreshDatabase();
    await seed();
  } finally {
    console.log = originalLog;
  }
}

// ---- Page script served to the browser ----------------------------------------------------------
function buildPageScript() {
  const appInfo = {
    name: 'Boring Balance',
    version: packageJson.version,
    author: packageJson.author,
    repositoryUrl: 'https://github.com/Tratt0re/boring_balance',
  };

  return `(() => {
  const channels = ${JSON.stringify(CHANNELS)};
  const listeners = new Map();
  async function invoke(channel, payload) {
    const response = await fetch('/__bridge/invoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel, payload }),
    });
    const body = await response.json();
    if (!body.ok) {
      throw new Error("Error invoking remote method '" + channel + "': Error: " + body.error);
    }
    return body.result;
  }
  const ipcClient = {};
  for (const [resource, actions] of Object.entries(channels)) {
    ipcClient[resource] = {};
    for (const [action, channel] of Object.entries(actions)) {
      ipcClient[resource][action] = (payload) => invoke(channel, payload);
    }
  }
  const source = new EventSource('/__bridge/events');
  source.onmessage = (message) => {
    const { channel, payload } = JSON.parse(message.data);
    for (const listener of listeners.get(channel) ?? []) listener(payload);
  };
  window.electronAPI = Object.freeze({
    ipcClient: Object.freeze(ipcClient),
    onIpcEvent: (channel, listener) => {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel).add(listener);
    },
    offIpcEvent: (channel, listener) => listeners.get(channel)?.delete(listener),
    appInfo: Object.freeze(${JSON.stringify(appInfo)}),
    platform: 'darwin',
    versions: Object.freeze({ chrome: 'bridge', electron: 'bridge', node: 'bridge' }),
  });
  try {
    if (localStorage.getItem('onboarding_completed') === null && !location.search.includes('fresh')) {
      localStorage.setItem('onboarding_completed', '1');
    }
  } catch {}
})();`;
}

// ---- HTTP server --------------------------------------------------------------------------------
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(
    JSON.stringify(body, (_key, value) => (typeof value === 'bigint' ? Number(value) : value)),
  );
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 5_000_000) {
        request.destroy();
        reject(new Error('Request body too large.'));
      }
    });
    request.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

const allowedHosts = new Set([`${HOST}:${PORT}`, `localhost:${PORT}`]);
function isTrustedRequest(request) {
  if (!allowedHosts.has(request.headers.host ?? '')) {
    return false;
  }
  const origin = request.headers.origin;
  return origin === undefined || origin === `http://${request.headers.host}`;
}

function serveStatic(response, pathname) {
  let filePath = path.resolve(DIST_DIR, `.${decodeURIComponent(pathname)}`);
  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + path.sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (path.extname(filePath) !== '') {
      response.writeHead(404).end('Not found');
      return;
    }
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const headers = {
    'content-type': MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  };
  if (path.basename(filePath) === 'index.html') {
    const html = fs
      .readFileSync(filePath, 'utf8')
      .replace(/<head>/i, '<head><script src="/__bridge/electron-api.js"></script>');
    response.writeHead(200, headers).end(html);
    return;
  }
  response.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(response);
}

async function handleInvoke(response, body) {
  const { channel, payload } = body;
  state.calls.push(channel);
  const handler = handlers[channel];
  if (typeof handler !== 'function') {
    sendJson(response, 200, { ok: false, error: `No handler registered for '${channel}'.` });
    return;
  }
  if (state.failPattern && String(channel).includes(state.failPattern)) {
    sendJson(response, 200, { ok: false, error: state.failMessage });
    return;
  }
  try {
    const result = await handler(payload);
    sendJson(response, 200, { ok: true, result: result === undefined ? null : result });
  } catch (error) {
    sendJson(response, 200, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleControl(request, response, pathname) {
  if (request.method === 'GET') {
    switch (pathname) {
      case '/__bridge/electron-api.js':
        response.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'no-store',
        });
        response.end(buildPageScript());
        return;
      case '/__bridge/events':
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        });
        response.write(': connected\n\n');
        eventClients.add(response);
        request.on('close', () => eventClients.delete(response));
        return;
      case '/__bridge/opened':
        sendJson(response, 200, state.opened);
        return;
      case '/__bridge/calls':
        sendJson(response, 200, state.calls);
        return;
      default:
        sendJson(response, 404, { ok: false, error: 'Unknown control endpoint.' });
        return;
    }
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }

  const body = await readJsonBody(request);
  switch (pathname) {
    case '/__bridge/invoke':
      await handleInvoke(response, body);
      return;
    case '/__bridge/fail':
      state.failPattern = body.pattern ?? null;
      state.failMessage = body.message ?? 'Injected failure';
      sendJson(response, 200, { ok: true, failPattern: state.failPattern });
      return;
    case '/__bridge/dialog':
      state.dialogCanceled = body.canceled === true;
      sendJson(response, 200, { ok: true, dialogCanceled: state.dialogCanceled });
      return;
    case '/__bridge/update':
      state.update = { ...state.update, ...body };
      sendJson(response, 200, { ok: true, update: state.update });
      return;
    case '/__bridge/emit':
      pushEvent(String(body.channel), body.payload);
      sendJson(response, 200, { ok: true, clients: eventClients.size });
      return;
    case '/__bridge/reset':
      state.failPattern = null;
      state.opened = [];
      state.calls = [];
      await resetAndSeed();
      sendJson(response, 200, { ok: true });
      return;
    default:
      sendJson(response, 404, { ok: false, error: 'Unknown control endpoint.' });
  }
}

async function main() {
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    console.error(`[bridge] ${DIST_DIR}/index.html not found. Run "npm run build" first.`);
    process.exit(1);
  }

  await resetAndSeed();

  const server = http.createServer(async (request, response) => {
    try {
      if (!isTrustedRequest(request)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const { pathname } = new URL(request.url, `http://${request.headers.host}`);
      if (pathname.startsWith('/__bridge/')) {
        await handleControl(request, response, pathname);
        return;
      }
      serveStatic(response, pathname);
    } catch (error) {
      console.error('[bridge] request failed:', error);
      if (!response.headersSent) {
        sendJson(response, 500, { ok: false, error: String(error?.message ?? error) });
      } else {
        response.end();
      }
    }
  });

  const shutdown = () => {
    server.close();
    database.closeDatabase();
    fs.rmSync(userDataDir, { recursive: true, force: true });
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(PORT, HOST, () => {
    console.log(
      `[bridge] serving ${path.relative(projectRoot, DIST_DIR)} on http://${HOST}:${PORT}`,
    );
    console.log(`[bridge] temporary data in ${userDataDir} (deleted on exit)`);
  });
}

main().catch((error) => {
  console.error('[bridge] failed to start:', error);
  process.exit(1);
});
