const FIRST_START_META_KEY = 'app.first_start';

// Startup code talks to the model, not the IPC controller: the controller only answers the renderer,
// and it refuses every app_meta key the renderer may not see.
function isFirstStart() {
  const { appMetaModel } = require('../models');

  try {
    const firstStartRecord = appMetaModel.getByKey(FIRST_START_META_KEY);

    if (firstStartRecord) {
      const normalizedValue = String(firstStartRecord.value).trim().toLowerCase();
      return normalizedValue === '1' || normalizedValue === 'true';
    }

    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('no such table: app_meta')) {
      return true;
    }

    throw error;
  }
}

function markFirstStartCompleted() {
  const { appMetaModel } = require('../models');

  const value = '0';
  if (appMetaModel.getByKey(FIRST_START_META_KEY)) {
    appMetaModel.updateByKey(FIRST_START_META_KEY, { value });
  } else {
    appMetaModel.create({ key: FIRST_START_META_KEY, value });
  }
}

module.exports = {
  isFirstStart,
  markFirstStartCompleted,
};
