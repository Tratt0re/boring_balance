const { ipcMain } = require('electron');
const { CHANNELS } = require('./channels');
const { createIpcClient } = require('./client');
const { createSenderValidator } = require('../utils/trusted-sender');

let handlersRegistered = false;

/**
 * Registers every IPC handler. Each one only answers the app's own page: pass `trustedSources`
 * ({ rendererDir, devServerUrl }) so calls from any other page are refused.
 */
function registerIpcHandlers(trustedSources) {
  if (handlersRegistered) {
    return;
  }

  if (!trustedSources?.rendererDir) {
    throw new Error('registerIpcHandlers needs trustedSources.rendererDir.');
  }

  const { IPC_HANDLERS } = require('./handlers');
  const validator = createSenderValidator({
    ...trustedSources,
    onRefused: ({ channel, url }) => {
      console.warn(`[electron] Refused IPC call "${channel}" from ${url ?? 'an unknown page'}.`);
    },
  });

  for (const [channel, handler] of Object.entries(IPC_HANDLERS)) {
    ipcMain.handle(
      channel,
      validator.wrap(channel, (payload) => handler(payload)),
    );
  }

  handlersRegistered = true;
}

module.exports = {
  CHANNELS,
  createIpcClient,
  registerIpcHandlers,
};
