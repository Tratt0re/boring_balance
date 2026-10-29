import { TestBed } from '@angular/core/testing';

import type { UpdateCheckResult } from '@/config/api';

import { UpdateService } from './update.service';

// The update check talks to GitHub through the main process. When it fails, the app must not raise an
// unhandled error: the startup check stays quiet, and the manual check from the About page tells the
// service's caller that it failed.

const newerVersion: UpdateCheckResult = {
  updateAvailable: true,
  currentVersion: '1.0.0',
  latestVersion: '1.1.0',
  releaseUrl: 'https://github.com/Tratt0re/boring_balance/releases/tag/v1.1.0',
  popupDismissedForThisVersion: false,
};

function installClient(update: Record<string, unknown>): void {
  (window as unknown as { electronAPI: unknown }).electronAPI = { ipcClient: { update } };
}

describe('UpdateService', () => {
  let service: UpdateService;

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  function create(update: Record<string, unknown>): void {
    installClient(update);
    TestBed.configureTestingModule({});
    service = TestBed.inject(UpdateService);
  }

  describe('checkForUpdates (the check at startup)', () => {
    it('stores the result when the check works', async () => {
      create({ check: async () => newerVersion });

      await service.checkForUpdates();

      expect(service.updateAvailable()).toBe(true);
      expect(service.updateResult()?.latestVersion).toBe('1.1.0');
    });

    it('does not throw when the check fails, so nothing is left unhandled', async () => {
      create({
        check: async () => {
          throw new Error("Error invoking remote method 'update:check': network down");
        },
      });

      await expect(service.checkForUpdates()).resolves.toBeUndefined();
    });

    it('logs the failure so it can be found', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      create({
        check: async () => {
          throw new Error('network down');
        },
      });

      await service.checkForUpdates();

      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining('check for updates'),
        expect.any(Error),
      );
      logged.mockRestore();
    });

    it('leaves the state as it was when the check fails', async () => {
      create({ check: async () => newerVersion });
      await service.checkForUpdates();
      installClient({
        check: async () => {
          throw new Error('network down');
        },
      });

      await service.checkForUpdates();

      expect(service.updateResult()?.latestVersion).toBe('1.1.0');
    });

    it('does not throw when there is no Electron bridge at all', async () => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(UpdateService);

      await expect(service.checkForUpdates()).resolves.toBeUndefined();
      expect(service.updateAvailable()).toBe(false);
    });
  });

  describe('forceCheckForUpdates (the check from the About page)', () => {
    it('stores the result when the check works', async () => {
      create({ forceCheck: async () => newerVersion });

      await service.forceCheckForUpdates();

      expect(service.updateAvailable()).toBe(true);
    });

    it('tells the caller when the check fails, so the screen can say so', async () => {
      create({
        forceCheck: async () => {
          throw new Error('network down');
        },
      });

      await expect(service.forceCheckForUpdates()).rejects.toThrow('network down');
    });

    it('leaves the state as it was when the check fails', async () => {
      create({ forceCheck: async () => newerVersion });
      await service.forceCheckForUpdates();
      installClient({
        forceCheck: async () => {
          throw new Error('network down');
        },
      });

      await service.forceCheckForUpdates().catch(() => undefined);

      expect(service.updateResult()?.latestVersion).toBe('1.1.0');
    });
  });

  describe('when the main process cannot reach GitHub', () => {
    it('shows no update for the "no update" answer it returns', async () => {
      create({
        check: async () => ({
          updateAvailable: false,
          currentVersion: '1.0.0',
          latestVersion: null,
          releaseUrl: null,
          popupDismissedForThisVersion: false,
        }),
      });

      await service.checkForUpdates();

      expect(service.updateAvailable()).toBe(false);
      expect(service.showModal()).toBe(false);
    });
  });
});
