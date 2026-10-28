// One lock for every operation that copies, replaces or deletes the database file: backup, restore,
// sync and reset. They each guarded only against themselves, so a backup could copy the file while a
// restore swapped it, or a reset could delete it under a running sync.

let currentName = null;

/** Name of the operation holding the lock, or null when idle. */
function currentOperation() {
  return currentName;
}

/**
 * Runs `task` while holding the lock. If another operation holds it, rejects at once with an error
 * naming it; the task is not started. The lock is released when the task settles, however it ends.
 */
async function runExclusive(name, task) {
  if (currentName !== null) {
    throw new Error(`Cannot start ${name}: a ${currentName} operation is already in progress.`);
  }

  currentName = name;
  try {
    return await task();
  } finally {
    currentName = null;
  }
}

module.exports = {
  currentOperation,
  runExclusive,
};
