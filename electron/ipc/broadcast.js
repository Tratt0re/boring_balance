const { BrowserWindow } = require('electron');

function broadcastIpcEvent(channel, payload) {
  if (typeof channel !== 'string' || channel.trim().length === 0) {
    throw new Error('channel must be a non-empty string.');
  }

  for (const browserWindow of BrowserWindow.getAllWindows()) {
    if (browserWindow.isDestroyed() || browserWindow.webContents.isDestroyed()) {
      continue;
    }

    browserWindow.webContents.send(channel, payload);
  }
}

module.exports = {
  broadcastIpcEvent,
};
