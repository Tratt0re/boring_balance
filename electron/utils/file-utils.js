const fs = require('node:fs');
const path = require('node:path');

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatTimestampForFilename(unixTimestampMilliseconds = Date.now()) {
  const date = new Date(Number(unixTimestampMilliseconds));
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function safeWriteFileAtomic(filePath, content) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error('filePath must be a non-empty string.');
  }

  if (!Buffer.isBuffer(content) && typeof content !== 'string') {
    throw new Error('content must be a string or Buffer.');
  }

  const normalizedPath = filePath.trim();
  const directoryPath = path.dirname(normalizedPath);
  fs.mkdirSync(directoryPath, { recursive: true });

  const temporaryPath = `${normalizedPath}.tmp-${process.pid}-${Date.now()}`;

  try {
    fs.writeFileSync(temporaryPath, content);
    fs.renameSync(temporaryPath, normalizedPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }

    throw error;
  }

  return normalizedPath;
}

function safeReplaceFileWithBackup(oldPath, newPath, backupSuffix) {
  if (typeof oldPath !== 'string' || oldPath.trim().length === 0) {
    throw new Error('oldPath must be a non-empty string.');
  }

  if (typeof newPath !== 'string' || newPath.trim().length === 0) {
    throw new Error('newPath must be a non-empty string.');
  }

  if (typeof backupSuffix !== 'string' || backupSuffix.trim().length === 0) {
    throw new Error('backupSuffix must be a non-empty string.');
  }

  const sourcePath = newPath.trim();
  const targetPath = oldPath.trim();

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  const targetDirectoryPath = path.dirname(targetPath);
  fs.mkdirSync(targetDirectoryPath, { recursive: true });

  const extension = path.extname(targetPath) || '.sqlite';
  const basePreviousLocalCopyPath = path.join(
    targetDirectoryPath,
    `db-local-prev-${backupSuffix.trim()}${extension}`,
  );
  let previousLocalCopyPath = basePreviousLocalCopyPath;
  let previousCopyIndex = 1;
  while (fs.existsSync(previousLocalCopyPath)) {
    previousLocalCopyPath = path.join(
      targetDirectoryPath,
      `db-local-prev-${backupSuffix.trim()}-${previousCopyIndex}${extension}`,
    );
    previousCopyIndex += 1;
  }
  const targetWalPath = `${targetPath}-wal`;
  const targetShmPath = `${targetPath}-shm`;
  let movedExistingFile = false;

  if (fs.existsSync(targetPath)) {
    fs.renameSync(targetPath, previousLocalCopyPath);
    movedExistingFile = true;
  }

  if (fs.existsSync(targetWalPath)) {
    fs.unlinkSync(targetWalPath);
  }

  if (fs.existsSync(targetShmPath)) {
    fs.unlinkSync(targetShmPath);
  }

  try {
    fs.copyFileSync(sourcePath, targetPath);
  } catch (error) {
    if (movedExistingFile && !fs.existsSync(targetPath) && fs.existsSync(previousLocalCopyPath)) {
      fs.renameSync(previousLocalCopyPath, targetPath);
    }

    throw error;
  }

  return movedExistingFile ? previousLocalCopyPath : null;
}

function listFilesSortedByMtime(directoryPath, options = {}) {
  if (typeof directoryPath !== 'string' || directoryPath.trim().length === 0) {
    throw new Error('directoryPath must be a non-empty string.');
  }

  const normalizedDirectoryPath = directoryPath.trim();
  const prefix = options.prefix;
  const suffix = options.suffix;
  const descending = options.descending !== false;
  const entries = fs.readdirSync(normalizedDirectoryPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .filter((entry) => (typeof prefix === 'string' ? entry.name.startsWith(prefix) : true))
    .filter((entry) => (typeof suffix === 'string' ? entry.name.endsWith(suffix) : true))
    .map((entry) => {
      const fullPath = path.join(normalizedDirectoryPath, entry.name);
      const stats = fs.statSync(fullPath);

      return {
        fileName: entry.name,
        fullPath,
        mtimeMs: Number(stats.mtimeMs),
        sizeBytes: Number(stats.size),
      };
    });

  files.sort((left, right) => {
    const mtimeDiff = left.mtimeMs - right.mtimeMs;
    if (mtimeDiff !== 0) {
      return descending ? -mtimeDiff : mtimeDiff;
    }

    return descending
      ? right.fileName.localeCompare(left.fileName)
      : left.fileName.localeCompare(right.fileName);
  });

  return files;
}

module.exports = {
  formatTimestampForFilename,
  listFilesSortedByMtime,
  safeReplaceFileWithBackup,
  safeWriteFileAtomic,
};
