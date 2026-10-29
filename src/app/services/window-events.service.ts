import { Injectable } from '@angular/core';

type IpcEventListener = (payload: unknown) => void;

/**
 * Window events pushed by the main process. Subscribing returns a function that stops the subscription.
 * Outside Electron (no bridge) subscribing does nothing, and the returned function is safe to call.
 */
@Injectable({
  providedIn: 'root',
})
export class WindowEventsService {
  onFullscreenChanged(listener: (isFullscreen: unknown) => void): () => void {
    const onIpcEvent = window.electronAPI?.onIpcEvent;
    const offIpcEvent = window.electronAPI?.offIpcEvent;
    if (!onIpcEvent || !offIpcEvent) {
      return () => undefined;
    }

    const forward: IpcEventListener = (payload) => listener(payload);
    onIpcEvent('window:fullscreenChanged', forward);

    return () => offIpcEvent('window:fullscreenChanged', forward);
  }
}
