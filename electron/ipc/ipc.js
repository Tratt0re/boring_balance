const { ipcMain } = require('electron');
const { CHANNELS } = require('./channels');
const { IPC_HANDLERS } = require('./handlers');

let handlersRegistered = false;

function createIpcClient(invoke) {
  const dbApi = {};

  Object.entries(CHANNELS).forEach(([resourceName, actionChannels]) => {
    const resourceApi = {};

    Object.entries(actionChannels).forEach(([actionName, channel]) => {
      resourceApi[actionName] = (payload) => invoke(channel, payload);
    });

    dbApi[resourceName] = Object.freeze(resourceApi);
  });

  return Object.freeze(dbApi);
}

function registerIpcHandlers() {
  if (handlersRegistered) {
    return;
  }

  for (const [channel, handler] of Object.entries(IPC_HANDLERS)) {
    ipcMain.handle(channel, async (_event, payload) => handler(payload));
  }

  handlersRegistered = true;
}

module.exports = {
  createIpcClient,
  registerIpcHandlers,
};
