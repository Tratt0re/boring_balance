const { CHANNELS } = require('./channels');

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

module.exports = {
  createIpcClient,
};
