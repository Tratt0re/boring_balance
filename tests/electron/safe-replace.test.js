import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadElectronModule } from './helpers/electron-db.js';

// safeReplaceFileWithBackup swaps the live database file for another one. Whatever goes wrong half
// way, the original file must end up back where it was, never stranded under a "previous" name.

const { safeReplaceFileWithBackup, restoreReplacedFile } = loadElectronModule(
  'electron/utils/file-utils.js',
);

let dir;
let live;
let incoming;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-replace-'));
  live = path.join(dir, 'live.sqlite');
  incoming = path.join(dir, 'incoming.sqlite');
  fs.writeFileSync(live, 'LIVE');
  fs.writeFileSync(incoming, 'INCOMING');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const previousCopies = () => fs.readdirSync(dir).filter((name) => name.startsWith('db-local-prev'));

describe('safeReplaceFileWithBackup', () => {
  it('replaces the file and keeps the old one aside', () => {
    const previous = safeReplaceFileWithBackup(live, incoming, 'stamp');

    expect(fs.readFileSync(live, 'utf8')).toBe('INCOMING');
    expect(fs.readFileSync(previous, 'utf8')).toBe('LIVE');
  });

  it('removes the old -wal and -shm files, which belong to the old database', () => {
    fs.writeFileSync(`${live}-wal`, 'w');
    fs.writeFileSync(`${live}-shm`, 's');

    safeReplaceFileWithBackup(live, incoming, 'stamp');

    expect(fs.existsSync(`${live}-wal`)).toBe(false);
    expect(fs.existsSync(`${live}-shm`)).toBe(false);
  });

  it('returns null when there was no file to replace', () => {
    fs.rmSync(live);

    expect(safeReplaceFileWithBackup(live, incoming, 'stamp')).toBeNull();
    expect(fs.readFileSync(live, 'utf8')).toBe('INCOMING');
  });

  it('puts the original back when the copy fails', () => {
    fs.rmSync(incoming);
    fs.mkdirSync(incoming); // exists, but cannot be copied as a file

    expect(() => safeReplaceFileWithBackup(live, incoming, 'stamp')).toThrow();

    expect(fs.readFileSync(live, 'utf8')).toBe('LIVE');
    expect(previousCopies()).toEqual([]);
  });

  it('puts the original back when the old -wal file cannot be removed', () => {
    fs.mkdirSync(`${live}-wal`); // a directory cannot be unlinked as a file

    expect(() => safeReplaceFileWithBackup(live, incoming, 'stamp')).toThrow();

    expect(fs.readFileSync(live, 'utf8')).toBe('LIVE');
    expect(previousCopies()).toEqual([]);
    expect(fs.readFileSync(incoming, 'utf8')).toBe('INCOMING');
  });

  it('puts the original back when the old -shm file cannot be removed', () => {
    fs.mkdirSync(`${live}-shm`);

    expect(() => safeReplaceFileWithBackup(live, incoming, 'stamp')).toThrow();

    expect(fs.readFileSync(live, 'utf8')).toBe('LIVE');
    expect(previousCopies()).toEqual([]);
  });

  it('does not overwrite an existing previous copy', () => {
    const first = safeReplaceFileWithBackup(live, incoming, 'stamp');
    fs.writeFileSync(incoming, 'SECOND');
    const second = safeReplaceFileWithBackup(live, incoming, 'stamp');

    expect(second).not.toBe(first);
    expect(fs.readFileSync(first, 'utf8')).toBe('LIVE');
    expect(fs.readFileSync(second, 'utf8')).toBe('INCOMING');
  });
});

describe('restoreReplacedFile', () => {
  it('puts the previous copy back over the replacement', () => {
    const previous = safeReplaceFileWithBackup(live, incoming, 'stamp');
    fs.writeFileSync(`${live}-wal`, 'new wal');

    restoreReplacedFile(live, previous);

    expect(fs.readFileSync(live, 'utf8')).toBe('LIVE');
    expect(fs.existsSync(previous)).toBe(false);
    expect(fs.existsSync(`${live}-wal`)).toBe(false);
  });

  it('removes a replacement when there was no previous copy', () => {
    fs.rmSync(live);
    const previous = safeReplaceFileWithBackup(live, incoming, 'stamp');

    expect(previous).toBeNull();
    restoreReplacedFile(live, previous);

    expect(fs.existsSync(live)).toBe(false);
  });

  it('refuses to roll back when the previous copy has gone missing, and keeps the replacement', () => {
    const previous = safeReplaceFileWithBackup(live, incoming, 'stamp');
    fs.rmSync(previous);

    expect(() => restoreReplacedFile(live, previous)).toThrow(/previous/i);

    expect(fs.readFileSync(live, 'utf8')).toBe('INCOMING');
  });
});
