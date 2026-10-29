import type { WindowService } from '@/services/window.service';

/** Reloads the app shell after data changed. The reload itself goes through the given WindowService. */
export function reloadAppShell(windowService: Pick<WindowService, 'reload'>, delayMs = 0): void {
  if (typeof window === 'undefined') {
    return;
  }

  const runReload = () => {
    void windowService.reload();
  };

  if (delayMs <= 0) {
    runReload();
    return;
  }

  globalThis.setTimeout(runReload, delayMs);
}
