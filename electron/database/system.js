function isInitializationCompleted() {
  const { appMetaController } = require('../controllers');

  try {
    const initializationRecord = appMetaController.get({ key: 'initialization' });
    return initializationRecord?.value === 'done';
  } catch (error) {
    if (error instanceof Error && error.message.includes('no such table: app_meta')) {
      return false;
    }

    throw error;
  }
}

function markInitializationCompleted() {
  const { appMetaController } = require('../controllers');

  appMetaController.upsert({
    key: 'initialization',
    value: 'done',
  });
}

module.exports = {
  isInitializationCompleted,
  markInitializationCompleted,
};
