const FIRST_START_META_KEY = 'app.first_start';

function isFirstStart() {
  const { appMetaController } = require('../controllers');

  try {
    const firstStartRecord = appMetaController.get({ key: FIRST_START_META_KEY });

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
  const { appMetaController } = require('../controllers');

  appMetaController.upsert({
    key: FIRST_START_META_KEY,
    value: '0',
  });
}

module.exports = {
  isFirstStart,
  markFirstStartCompleted,
};
