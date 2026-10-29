import { TestBed } from '@angular/core/testing';

import { WindowService } from './window.service';

// The window reload goes through the Electron bridge when it exists, and falls back to a plain page
// reload when it does not (for example in a browser). A failing bridge reload must still reload.

type Bridge = { ipcClient: { window: { reload: () => Promise<void> } } };

function installBridge(reload: () => Promise<void>): void {
  (window as unknown as { electronAPI: Bridge }).electronAPI = {
    ipcClient: { window: { reload } },
  };
}

describe('WindowService', () => {
  let service: WindowService;
  let pageReload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WindowService);
    pageReload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload: pageReload });
  });

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    vi.unstubAllGlobals();
  });

  it('reloads through the bridge when it is available', async () => {
    const reload = vi.fn(async () => undefined);
    installBridge(reload);

    await service.reload();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(pageReload).not.toHaveBeenCalled();
  });

  it('falls back to a page reload when there is no bridge', async () => {
    await service.reload();

    expect(pageReload).toHaveBeenCalledTimes(1);
  });

  it('does not try to call the bridge when it is missing', async () => {
    const reload = vi.fn(async () => undefined);
    installBridge(reload);
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;

    await service.reload();

    expect(reload).not.toHaveBeenCalled();
    expect(pageReload).toHaveBeenCalledTimes(1);
  });

  it('falls back to a page reload when the bridge reload fails', async () => {
    installBridge(async () => {
      throw new Error('window gone');
    });

    await service.reload();

    expect(pageReload).toHaveBeenCalledTimes(1);
  });
});
