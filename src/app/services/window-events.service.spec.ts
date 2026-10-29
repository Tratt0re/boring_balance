import { TestBed } from '@angular/core/testing';

import { WindowEventsService } from './window-events.service';

// The main process tells the page when the window enters or leaves fullscreen. The layout subscribes
// through this service, so it never touches the Electron bridge itself. Without a bridge (a browser)
// the subscription is a harmless no-op.

type Listener = (payload: unknown) => void;

function installBridge(): { listeners: Map<string, Set<Listener>> } {
  const listeners = new Map<string, Set<Listener>>();
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    onIpcEvent: (channel: string, listener: Listener) => {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel)!.add(listener);
    },
    offIpcEvent: (channel: string, listener: Listener) => {
      listeners.get(channel)?.delete(listener);
    },
  };
  return { listeners };
}

describe('WindowEventsService', () => {
  let service: WindowEventsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WindowEventsService);
  });

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it('forwards fullscreen changes to the listener', () => {
    const { listeners } = installBridge();
    const received: unknown[] = [];

    service.onFullscreenChanged((payload) => received.push(payload));
    listeners
      .get('window:fullscreenChanged')!
      .forEach((listener) => listener({ isFullscreen: true }));

    expect(received).toEqual([{ isFullscreen: true }]);
  });

  it('stops forwarding once unsubscribed', () => {
    const { listeners } = installBridge();
    const received: unknown[] = [];
    const stop = service.onFullscreenChanged((payload) => received.push(payload));

    stop();
    listeners.get('window:fullscreenChanged')?.forEach((listener) => listener(true));

    expect(received).toEqual([]);
  });

  it('does nothing and returns a safe stop function when there is no bridge', () => {
    const stop = service.onFullscreenChanged(() => undefined);

    expect(() => stop()).not.toThrow();
  });

  it('keeps separate subscribers apart', () => {
    const { listeners } = installBridge();
    const first: unknown[] = [];
    const second: unknown[] = [];
    const stopFirst = service.onFullscreenChanged((payload) => first.push(payload));
    service.onFullscreenChanged((payload) => second.push(payload));

    stopFirst();
    listeners.get('window:fullscreenChanged')?.forEach((listener) => listener(false));

    expect(first).toEqual([]);
    expect(second).toEqual([false]);
  });
});
