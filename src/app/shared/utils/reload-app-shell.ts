export function reloadAppShell(delayMs = 0): void {
  if (typeof window === 'undefined') {
    return;
  }

  const runReload = () => {
    const reload = window.electronAPI?.ipcClient?.window?.reload;
    if (reload) {
      void reload().catch(() => {
        globalThis.location.reload();
      });
      return;
    }

    globalThis.location.reload();
  };

  if (delayMs <= 0) {
    runReload();
    return;
  }

  globalThis.setTimeout(runReload, delayMs);
}
