import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadElectronModule } from './helpers/electron-db.js';

// When a write fails, the code removes its temporary file on the way out. If that removal also fails,
// the error about the write must still be the one the caller sees: the cleanup failure is a side issue.

const fileUtils = loadElectronModule('electron/utils/file-utils.js');
const syncModel = loadElectronModule('electron/models/sync.model.js');

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-cleanup-'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Makes the rename fail with the given reason, and the removal of any file fail too. */
function failWriteAndCleanup(writeReason) {
  vi.spyOn(fs, 'renameSync').mockImplementation(() => {
    throw new Error(writeReason);
  });
  vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
    throw new Error('EPERM: cleanup refused');
  });
}

function validIndex() {
  return {
    schema_version: 1,
    updated_at_ms: 1,
    latest: {
      file: 'snap_a_1_1_dev.sqlite',
      db_uuid: 'a',
      change_counter: 1,
      last_write_ms: 1,
      created_at_ms: 1,
      device_id: 'dev',
    },
  };
}

describe('safeWriteFileAtomic', () => {
  it('reports the write failure, not the cleanup failure', () => {
    failWriteAndCleanup('disk full while writing');

    expect(() => fileUtils.safeWriteFileAtomic(path.join(dir, 'settings.json'), '{}')).toThrow(
      'disk full while writing',
    );
  });

  it('logs the cleanup failure so it is not silent', () => {
    failWriteAndCleanup('rename refused');

    expect(() => fileUtils.safeWriteFileAtomic(path.join(dir, 'settings.json'), '{}')).toThrow();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('temporary file'),
      expect.stringContaining('cleanup refused'),
    );
  });

  it('still succeeds, with no log, when the write works', () => {
    const target = path.join(dir, 'settings.json');

    fileUtils.safeWriteFileAtomic(target, '{"ok":true}');

    expect(fs.readFileSync(target, 'utf8')).toBe('{"ok":true}');
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe('the sync index writer, after its own write has started', () => {
  it('reports the rename failure, not the cleanup failure', () => {
    const target = path.join(dir, 'sync_index.json');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('rename refused for index');
    });
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('EPERM: cleanup refused');
    });

    expect(() => syncModel.writeIndexAtomic(target, validIndex())).toThrow(
      'rename refused for index',
    );
  });
});

describe('the sync snapshot writer', () => {
  it('reports the rename failure, not the cleanup failure', async () => {
    const snapshotsDir = path.join(dir, 'snapshots');
    fs.mkdirSync(snapshotsDir);
    const fakeDatabase = {
      backup: async (temporaryPath) => {
        fs.writeFileSync(temporaryPath, 'snapshot');
      },
    };
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('rename refused for snapshot');
    });
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('EPERM: cleanup refused');
    });

    await expect(
      syncModel.createSnapshot(fakeDatabase, snapshotsDir, 'device-a', {
        db_uuid: 'uuid-1',
        change_counter: 3,
        last_write_ms: 9,
        schema_version: 1,
      }),
    ).rejects.toThrow('rename refused for snapshot');
  });
});

describe('the backup writer', () => {
  const backupModel = loadElectronModule('electron/models/backup.model.js');

  it('reports the backup write failure, not the cleanup failure', async () => {
    const folder = path.join(dir, 'backups');
    fs.mkdirSync(folder);
    const fakeDatabase = {
      prepare: () => ({ all: () => [], get: () => undefined }),
      backup: async (temporaryPath) => {
        fs.writeFileSync(temporaryPath, 'partial');
        throw new Error('backup write refused');
      },
    };
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('EPERM: cleanup refused');
    });

    await expect(backupModel.createBackup(fakeDatabase, folder, '1.0.0')).rejects.toThrow(
      'backup write refused',
    );
  });
});

describe('the sync index writer', () => {
  it('reports the write failure, not the cleanup failure, when the write itself fails', () => {
    const target = path.join(dir, 'sync_index.json');
    const realExists = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p) =>
      String(p).endsWith('.tmp') ? realExists(p) && false : realExists(p),
    );
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full while writing index');
    });
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('EPERM: cleanup refused');
    });

    expect(() => syncModel.writeIndexAtomic(target, validIndex())).toThrow(
      'disk full while writing index',
    );
  });

  it('refuses to write over a stale temporary file it cannot remove, and leaves the index alone', () => {
    const target = path.join(dir, 'sync_index.json');
    fs.writeFileSync(target, 'PREVIOUS');
    fs.mkdirSync(`${target}.tmp`); // a stale temporary entry that cannot be unlinked as a file

    expect(() => syncModel.writeIndexAtomic(target, validIndex())).toThrow();

    expect(fs.readFileSync(target, 'utf8')).toBe('PREVIOUS');
  });
});
