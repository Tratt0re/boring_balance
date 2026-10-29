// Turns the results of the quit-time backup and sync into what main.js shows the user. Only a failed
// operation matters: a successful, skipped or unconfigured one produces no message.

const OPERATION_LABELS = Object.freeze({
  backup: 'The automatic backup',
  sync: 'The automatic sync',
});

/**
 * @param {Array<unknown>} outcomes Results of the quit-time operations (null when not run).
 * @returns {{ title: string, message: string, detail: string } | null} The dialog to show, or null when
 *   nothing failed and the app can quit without asking.
 */
function buildQuitFailureDialog(outcomes) {
  const failures = (Array.isArray(outcomes) ? outcomes : []).filter(
    (outcome) => outcome && typeof outcome === 'object' && outcome.failed === true,
  );

  if (failures.length === 0) {
    return null;
  }

  const lines = failures.map((failure) => {
    const label = OPERATION_LABELS[failure.operation] ?? 'An operation';
    const reason =
      typeof failure.message === 'string' && failure.message.trim()
        ? failure.message.trim()
        : 'unknown error';
    return `${label} failed: ${reason}`;
  });

  return {
    title: 'Boring Balance could not finish saving',
    message: 'Your latest changes may not be backed up or synced yet.',
    detail: lines.join('\n'),
  };
}

module.exports = {
  buildQuitFailureDialog,
};
