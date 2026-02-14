const { contextBridge, ipcRenderer } = require('electron');
const { createIpcClient } = require('./ipc');

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

const ipcClient = createIpcClient(invoke);

contextBridge.exposeInMainWorld('electronAPI', {
  ipcClient,
  platform: process.platform,
  versions: Object.freeze({
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  }),
});
