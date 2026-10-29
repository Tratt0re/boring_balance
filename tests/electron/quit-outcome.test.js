import { describe, expect, it } from 'vitest';

import { loadElectronModule } from './helpers/electron-db.js';

// Decides what the user sees when the app is closing and the quit-time backup or sync failed.

const { buildQuitFailureDialog } = loadElectronModule('electron/utils/quit-outcome.js');

describe('when the quit can go ahead without asking', () => {
  it.each([
    ['nothing ran', [null, null]],
    ['both succeeded', [{ pushed: true }, { fileName: 'x.sqlite' }]],
    ['one was skipped', [{ action: 'skipped' }, null]],
    ['nothing was given', []],
    ['the input is not a list', undefined],
  ])('returns null when %s', (_label, outcomes) => {
    expect(buildQuitFailureDialog(outcomes)).toBeNull();
  });

  it('ignores a failure that is not marked as one', () => {
    expect(buildQuitFailureDialog([{ failed: false, message: 'x' }])).toBeNull();
  });
});

describe('when something failed', () => {
  it('names the failed backup and its reason', () => {
    const dialog = buildQuitFailureDialog([
      { failed: true, operation: 'backup', message: 'disk full' },
    ]);

    expect(dialog.detail).toBe('The automatic backup failed: disk full');
  });

  it('names the failed sync and its reason', () => {
    const dialog = buildQuitFailureDialog([
      null,
      { failed: true, operation: 'sync', message: 'EPERM' },
    ]);

    expect(dialog.detail).toBe('The automatic sync failed: EPERM');
  });

  it('lists both when both failed', () => {
    const dialog = buildQuitFailureDialog([
      { failed: true, operation: 'backup', message: 'a' },
      { failed: true, operation: 'sync', message: 'b' },
    ]);

    expect(dialog.detail.split('\n')).toEqual([
      'The automatic backup failed: a',
      'The automatic sync failed: b',
    ]);
  });

  it('still shows a message when the reason is missing or blank', () => {
    expect(buildQuitFailureDialog([{ failed: true, operation: 'sync' }]).detail).toBe(
      'The automatic sync failed: unknown error',
    );
    expect(
      buildQuitFailureDialog([{ failed: true, operation: 'sync', message: '  ' }]).detail,
    ).toBe('The automatic sync failed: unknown error');
  });

  it('names an unknown operation generically rather than leaving it out', () => {
    expect(
      buildQuitFailureDialog([{ failed: true, operation: 'other', message: 'x' }]).detail,
    ).toBe('An operation failed: x');
  });

  it('says that changes may not be saved yet, and gives a title', () => {
    const dialog = buildQuitFailureDialog([{ failed: true, operation: 'backup', message: 'x' }]);

    expect(dialog.title).toMatch(/Boring Balance/);
    expect(dialog.message).toMatch(/may not be backed up or synced/);
  });
});
