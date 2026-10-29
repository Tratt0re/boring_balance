import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import { BaseIpcService } from './base-ipc.service';

/** Reloads the app window. Uses the Electron bridge when present; otherwise reloads the page. */
@Injectable({
  providedIn: 'root',
})
export class WindowService extends BaseIpcService<APIChannel.WINDOW> {
  constructor() {
    super(APIChannel.WINDOW);
  }

  async reload(): Promise<void> {
    if (!window.electronAPI?.ipcClient?.window?.reload) {
      globalThis.location.reload();
      return;
    }

    try {
      await this.ipcClient.reload();
    } catch {
      globalThis.location.reload();
    }
  }
}
