const { CHANNELS } = require('./channels');
const { IPC_HANDLERS } = require('./handlers');
const { createIpcClient, registerIpcHandlers } = require('./ipc');

module.exports = {
  CHANNELS,
  IPC_HANDLERS,
  createIpcClient,
  registerIpcHandlers,
};
