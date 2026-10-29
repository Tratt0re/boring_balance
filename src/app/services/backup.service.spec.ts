import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { BackupService } from './backup.service';

// The messages BackupService shows come from the translation files, so they follow the chosen language.
// A message sent by the main process (an Error's own text) is shown as it is: it is already specific.

type Client = Record<string, (...args: unknown[]) => Promise<unknown>>;
type Listener = (payload: unknown) => void;

const TRANSLATIONS = {
  dataBackups: {
    toasts: {
      backup: {
        loadSettingsFailed: 'T:loadSettingsFailed',
        updateSettingsFailed: 'T:updateSettingsFailed',
        loadStateFailed: 'T:loadStateFailed',
        selectFolderFailed: 'T:selectFolderFailed',
        loadListFailed: 'T:loadListFailed',
        selectFileFailed: 'T:selectFileFailed',
        backupFailed: 'T:backupFailed',
        restoreFailed: 'T:restoreFailed',
        deleted: 'T:deleted',
        deleteFailed: 'T:deleteFailed',
        completed: 'T:completed {{fileName}}',
        restoreCompleted: 'T:restoreCompleted',
      },
    },
  },
};

describe('BackupService toasts', () => {
  let service: BackupService;
  let listeners: Map<string, Listener>;
  let toastError: ReturnType<typeof vi.spyOn>;
  let toastSuccess: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    toastError = vi.spyOn(toast, 'error').mockImplementation(() => 1);
    toastSuccess = vi.spyOn(toast, 'success').mockImplementation(() => 1);
  });

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    vi.restoreAllMocks();
  });

  function create(client: Client): void {
    listeners = new Map();
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      ipcClient: { backup: client },
      onIpcEvent: (channel: string, listener: Listener) => listeners.set(channel, listener),
      offIpcEvent: () => undefined,
    };
    TestBed.configureTestingModule({
      providers: [provideTranslateService({ lang: 'en', fallbackLang: 'en' })],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', TRANSLATIONS, true);
    translate.use('en');
    service = TestBed.inject(BackupService);
  }

  describe('messages the app owns', () => {
    it('shows the translated fallback when a failure has no message of its own', async () => {
      create({
        getSettings: async () => {
          throw 'a plain string, not an Error';
        },
      });

      await firstValueFrom(service.getSettings());

      expect(toastError).toHaveBeenCalledWith('T:loadSettingsFailed');
    });

    it('shows a translated success message', async () => {
      create({ remove: async () => ({ changed: 1 }), list: async () => [] });

      await firstValueFrom(service.remove('/some/boring-balance-backup.sqlite'));

      expect(toastSuccess).toHaveBeenCalledWith('T:deleted');
    });

    it('fills the file name into the translated completion message', () => {
      create({ list: async () => [] });

      listeners.get('backup:backupCompleted')!({ fileName: 'boring-balance-backup-1.sqlite' });

      expect(toastSuccess).toHaveBeenCalledWith('T:completed boring-balance-backup-1.sqlite');
    });

    it('shows the translated restore-completed message', () => {
      create({});

      listeners.get('backup:restoreCompleted')!({});

      expect(toastSuccess).toHaveBeenCalledWith('T:restoreCompleted');
    });

    it('shows the translated fallback for a failure event that carries no text', () => {
      create({});

      listeners.get('backup:backupFailed')!({});
      listeners.get('backup:restoreFailed')!(null);

      expect(toastError).toHaveBeenNthCalledWith(1, 'T:backupFailed');
      expect(toastError).toHaveBeenNthCalledWith(2, 'T:restoreFailed');
    });
  });

  describe('every call that can fail shows its own translated fallback', () => {
    const calls: [string, string, (service: BackupService) => unknown, string][] = [
      ['getSettings', 'getSettings', (s) => s.getSettings(), 'T:loadSettingsFailed'],
      ['updateSettings', 'updateSettings', (s) => s.updateSettings({}), 'T:updateSettingsFailed'],
      ['getState', 'getState', (s) => s.getState(), 'T:loadStateFailed'],
      ['selectFolder', 'selectFolder', (s) => s.selectFolder(), 'T:selectFolderFailed'],
      ['listBackups', 'list', (s) => s.listBackups(), 'T:loadListFailed'],
      [
        'selectRestoreFile',
        'selectRestoreFile',
        (s) => s.selectRestoreFile(),
        'T:selectFileFailed',
      ],
      ['runNow', 'runNow', (s) => s.runNow(), 'T:backupFailed'],
      ['restore', 'restore', (s) => s.restore('/x.sqlite'), 'T:restoreFailed'],
      ['remove', 'remove', (s) => s.remove('/x.sqlite'), 'T:deleteFailed'],
    ];

    it.each(calls)('%s', async (_name, clientMethod, call, expected) => {
      create({
        [clientMethod]: async () => {
          throw 'a plain string, not an Error';
        },
      });

      await firstValueFrom(call(service) as never).catch(() => undefined);

      expect(toastError).toHaveBeenCalledWith(expected);
    });
  });

  describe('messages the main process wrote', () => {
    it('shows an Error message as it is', async () => {
      create({
        getSettings: async () => {
          throw new Error('Backup folder is not writable.');
        },
      });

      await firstValueFrom(service.getSettings());

      expect(toastError).toHaveBeenCalledWith('Backup folder is not writable.');
    });

    it('shows the text of a failure event as it is', () => {
      create({});

      listeners.get('backup:backupFailed')!({ error: 'No space left on device.' });

      expect(toastError).toHaveBeenCalledWith('No space left on device.');
    });
  });

  describe('a language without the key', () => {
    it('falls back to English text instead of showing the raw key', async () => {
      create({
        getSettings: async () => {
          throw 'x';
        },
      });
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('fr', { dataBackups: { toasts: { backup: {} } } }, false);
      translate.use('fr');

      await firstValueFrom(service.getSettings());

      expect(toastError).toHaveBeenCalledWith('T:loadSettingsFailed');
    });
  });
});
