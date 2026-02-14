const { ipcMain } = require('electron');
const { CHANNELS } = require('./channels');
const { createIpcClient } = require('./client');

let handlersRegistered = false;

function registerIpcHandlers() {
  if (handlersRegistered) {
    return;
  }

  const { IPC_HANDLERS } = require('./handlers');

  for (const [channel, handler] of Object.entries(IPC_HANDLERS)) {
    ipcMain.handle(channel, async (_event, payload) => handler(payload));
  }

  handlersRegistered = true;
}

module.exports = {
  CHANNELS,
  createIpcClient,
  registerIpcHandlers,
};
