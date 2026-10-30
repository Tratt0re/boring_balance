import { APIChannel } from '@/config/api';
import type { ElectronIpcClient } from '@/config/api';

export abstract class BaseIpcService<TChannel extends APIChannel> {
  constructor(protected readonly channel: TChannel) {}

  protected get ipcClient(): ElectronIpcClient[`${TChannel}`] {
    // TypeScript cannot prove that an enum member equals its own string value type, so this needs the cast.
    const channelKey = this.channel as unknown as `${TChannel}`;
    const channelClient = window.electronAPI?.ipcClient?.[channelKey];
    if (!channelClient) {
      throw new Error(`Electron IPC channel "${String(this.channel)}" is not available in this environment.`);
    }

    return channelClient;
  }
}
