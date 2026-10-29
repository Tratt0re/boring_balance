import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { SyncService } from './sync.service';

// The messages SyncService shows come from the translation files, so they follow the chosen language.
// Text written by the main process (an Error's message, or the reason for a skipped sync) is shown as
// it is, because it is already specific.

type Client = Record<string, (...args: unknown[]) => Promise<unknown>>;
type Listener = (payload: unknown) => void;

const TRANSLATIONS = {
  dataBackups: {
    toasts: {
      sync: {
        loadSettingsFailed: 'T:loadSettingsFailed',
        updateSettingsFailed: 'T:updateSettingsFailed',
        loadStateFailed: 'T:loadStateFailed',
        checkNewerFailed: 'T:checkNewerFailed',
        selectFolderFailed: 'T:selectFolderFailed',
        inspectFolderFailed: 'T:inspectFolderFailed',
        enabled: 'T:enabled',
        enableFailed: 'T:enableFailed',
        disabled: 'T:disabled',
        disableFailed: 'T:disableFailed',
        syncNothingChanged: 'T:syncNothingChanged',
        syncFailed: 'T:syncFailed',
        pullNothingNewer: 'T:pullNothingNewer',
        pullFailed: 'T:pullFailed',
        pushNothingToPublish: 'T:pushNothingToPublish',
        pushFailed: 'T:pushFailed',
        loadSnapshotsFailed: 'T:loadSnapshotsFailed',
        defaultFileUpdated: 'T:defaultFileUpdated',
        selectDefaultFileFailed: 'T:selectDefaultFileFailed',
        fileDeleted: 'T:fileDeleted',
        deleteFileFailed: 'T:deleteFileFailed',
        pullCompleted: 'T:pullCompleted',
        pushCompleted: 'T:pushCompleted',
        conflictDetected: 'T:conflictDetected',
        pullCompletedWithId: 'T:pullCompletedWithId ({{snapshotId}})',
        pushCompletedWithId: 'T:pushCompletedWithId ({{snapshotId}})',
      },
    },
  },
};

describe('SyncService toasts', () => {
  let service: SyncService;
  let listeners: Map<string, Listener>;
  let toastError: ReturnType<typeof vi.spyOn>;
  let toastSuccess: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    toastError = vi.spyOn(toast, 'error').mockImplementation(() => 1);
    toastSuccess = vi.spyOn(toast, 'success').mockImplementation(() => 1);
    // Stops the page reload that follows a completed pull or a conflict.
    vi.stubGlobal('location', { ...window.location, reload: vi.fn() });
  });

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function create(client: Client): void {
    listeners = new Map();
    const withDefaults: Client = {
      getSettings: async () => ({}),
      getState: async () => ({}),
      ...client,
    };
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      ipcClient: { sync: withDefaults, window: { reload: async () => undefined } },
      onIpcEvent: (channel: string, listener: Listener) => listeners.set(channel, listener),
      offIpcEvent: () => undefined,
    };
    TestBed.configureTestingModule({
      providers: [provideTranslateService({ lang: 'en', fallbackLang: 'en' })],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', TRANSLATIONS, true);
    translate.use('en');
    service = TestBed.inject(SyncService);
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

    it('shows a translated success message when sync is enabled', async () => {
      create({ enable: async () => ({ ok: true }) });

      await firstValueFrom(service.enable('/some/folder'));

      expect(toastSuccess).toHaveBeenCalledWith('T:enabled');
    });

    it('shows the translated fallback when a skipped pull gave no reason', async () => {
      create({ pullNow: async () => ({ action: 'skipped' }) });

      await firstValueFrom(service.pullNow());

      expect(toastSuccess).toHaveBeenCalledWith('T:pullNothingNewer');
    });

    it('shows the translated fallback when a skipped push gave no reason', async () => {
      create({ pushNow: async () => ({ action: 'skipped' }) });

      await firstValueFrom(service.pushNow());

      expect(toastSuccess).toHaveBeenCalledWith('T:pushNothingToPublish');
    });

    it('shows the translated fallback for a failure event that carries no text', () => {
      create({});

      listeners.get('sync:pullFailed')!({});
      listeners.get('sync:pushFailed')!(null);

      expect(toastError).toHaveBeenNthCalledWith(1, 'T:pullFailed');
      expect(toastError).toHaveBeenNthCalledWith(2, 'T:pushFailed');
    });

    it('translates the sync conflict message', () => {
      create({});

      listeners.get('sync:conflictDetected')!({ reason: 'x' });

      expect(toastError).toHaveBeenCalledWith('T:conflictDetected');
    });
  });

  describe('every call that can fail shows its own translated fallback', () => {
    const calls: [string, (service: SyncService) => unknown, string][] = [
      ['getSettings', (s) => s.getSettings(), 'T:loadSettingsFailed'],
      ['updateSettings', (s) => s.updateSettings({}), 'T:updateSettingsFailed'],
      ['getState', (s) => s.getState(), 'T:loadStateFailed'],
      ['checkAvailability', (s) => s.checkAvailability(), 'T:checkNewerFailed'],
      ['selectFolder', (s) => s.selectFolder(), 'T:selectFolderFailed'],
      ['repoStatus', (s) => s.repoStatus('/f'), 'T:inspectFolderFailed'],
      ['enable', (s) => s.enable('/f'), 'T:enableFailed'],
      ['disable', (s) => s.disable(), 'T:disableFailed'],
      ['syncNow', (s) => s.syncNow(), 'T:syncFailed'],
      ['pullNow', (s) => s.pullNow(), 'T:pullFailed'],
      ['pushNow', (s) => s.pushNow(), 'T:pushFailed'],
      ['listSnapshots', (s) => s.listSnapshots(), 'T:loadSnapshotsFailed'],
      ['setDefaultSnapshot', (s) => s.setDefaultSnapshot('/s.sqlite'), 'T:selectDefaultFileFailed'],
      ['removeSnapshot', (s) => s.removeSnapshot('/s.sqlite'), 'T:deleteFileFailed'],
    ];

    it.each(calls)('%s', async (name, call, expected) => {
      create({
        [name === 'removeSnapshot' ? 'removeSnapshot' : name]: async () => {
          throw 'a plain string, not an Error';
        },
      });

      await firstValueFrom(call(service) as never).catch(() => undefined);

      expect(toastError).toHaveBeenCalledWith(expected);
    });
  });

  describe('success messages', () => {
    it('shows each translated success message', async () => {
      create({
        disable: async () => ({ ok: true }),
        syncNow: async () => ({ pulled: false, pushed: false }),
        removeSnapshot: async () => ({ changed: 1 }),
        listSnapshots: async () => [],
        setDefaultSnapshot: async () => ({ action: 'selected-default' }),
      });

      await firstValueFrom(service.disable());
      await firstValueFrom(service.syncNow());
      await firstValueFrom(service.removeSnapshot('/s.sqlite'));
      await firstValueFrom(service.setDefaultSnapshot('/s.sqlite'));

      expect(toastSuccess).toHaveBeenCalledWith('T:disabled');
      expect(toastSuccess).toHaveBeenCalledWith('T:syncNothingChanged');
      expect(toastSuccess).toHaveBeenCalledWith('T:fileDeleted');
      expect(toastSuccess).toHaveBeenCalledWith('T:defaultFileUpdated');
    });
  });

  describe('completed messages with an optional snapshot id', () => {
    it('uses the message without an id when there is none', () => {
      create({});

      listeners.get('sync:pullCompleted')!({});
      listeners.get('sync:pushCompleted')!({});

      expect(toastSuccess).toHaveBeenNthCalledWith(1, 'T:pullCompleted');
      expect(toastSuccess).toHaveBeenNthCalledWith(2, 'T:pushCompleted');
    });

    it('uses the message with the id filled in when there is one', () => {
      create({});

      listeners.get('sync:pullCompleted')!({ snapshotId: 'snap_1' });
      listeners.get('sync:pushCompleted')!({ snapshotId: 'snap_2' });

      expect(toastSuccess).toHaveBeenNthCalledWith(1, 'T:pullCompletedWithId (snap_1)');
      expect(toastSuccess).toHaveBeenNthCalledWith(2, 'T:pushCompletedWithId (snap_2)');
    });
  });

  describe('messages the main process wrote', () => {
    it('shows an Error message as it is', async () => {
      create({
        enable: async () => {
          throw new Error('Sync folder is not writable.');
        },
      });

      await firstValueFrom(service.enable('/some/folder')).catch(() => undefined);

      expect(toastError).toHaveBeenCalledWith('Sync folder is not writable.');
    });

    it('shows the reason of a skipped pull as it is', async () => {
      create({
        pullNow: async () => ({
          action: 'skipped',
          reason: 'Remote snapshot is not newer than the local database.',
        }),
      });

      await firstValueFrom(service.pullNow());

      expect(toastSuccess).toHaveBeenCalledWith(
        'Remote snapshot is not newer than the local database.',
      );
    });

    it('shows the text of a failure event as it is', () => {
      create({});

      listeners.get('sync:pushFailed')!({ error: 'Index is locked.' });

      expect(toastError).toHaveBeenCalledWith('Index is locked.');
    });
  });
});
