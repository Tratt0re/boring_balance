import { APIChannel } from '@/config/api';
import type { ElectronIpcClient } from '@/config/api';

export abstract class BaseIpcService<TChannel extends APIChannel> {
  constructor(protected readonly channel: TChannel) {}

  protected get ipcClient(): ElectronIpcClient[`${TChannel}`] {
    const channelKey = this.channel as unknown as `${TChannel}`;
    const channelClient = window.electronAPI?.ipcClient?.[channelKey];
    if (!channelClient) {
      throw new Error(`Electron IPC channel "${String(this.channel)}" is not available in this environment.`);
    }

    return channelClient;
  }
}
