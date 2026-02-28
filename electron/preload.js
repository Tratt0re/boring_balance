const { contextBridge, ipcRenderer } = require('electron');
const { createIpcClient } = require('./ipc');

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

const ipcEventListenerStore = new Map();

function getChannelListenerMap(channel) {
  if (!ipcEventListenerStore.has(channel)) {
    ipcEventListenerStore.set(channel, new WeakMap());
  }

  return ipcEventListenerStore.get(channel);
}

function onIpcEvent(channel, listener) {
  if (typeof channel !== 'string' || channel.trim().length === 0) {
    throw new Error('IPC event channel must be a non-empty string.');
  }

  if (typeof listener !== 'function') {
    throw new Error('IPC event listener must be a function.');
  }

  const normalizedChannel = channel.trim();
  const listenerMap = getChannelListenerMap(normalizedChannel);
  if (listenerMap.has(listener)) {
    return;
  }

  const wrappedListener = (_event, payload) => listener(payload);
  listenerMap.set(listener, wrappedListener);
  ipcRenderer.on(normalizedChannel, wrappedListener);
}

function offIpcEvent(channel, listener) {
  if (typeof channel !== 'string' || channel.trim().length === 0) {
    return;
  }

  if (typeof listener !== 'function') {
    return;
  }

  const normalizedChannel = channel.trim();
  const listenerMap = ipcEventListenerStore.get(normalizedChannel);
  if (!listenerMap) {
    return;
  }

  const wrappedListener = listenerMap.get(listener);
  if (!wrappedListener) {
    return;
  }

  ipcRenderer.removeListener(normalizedChannel, wrappedListener);
  listenerMap.delete(listener);
}

const ipcClient = createIpcClient(invoke);

contextBridge.exposeInMainWorld('electronAPI', {
  ipcClient,
  onIpcEvent,
  offIpcEvent,
  platform: process.platform,
  versions: Object.freeze({
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  }),
});
