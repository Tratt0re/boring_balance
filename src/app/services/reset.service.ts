import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import { BaseIpcService } from './base-ipc.service';

@Injectable({
  providedIn: 'root',
})
export class ResetService extends BaseIpcService<APIChannel.RESET> {
  constructor() {
    super(APIChannel.RESET);
  }

  async clearFinancialData(): Promise<{ ok: boolean; error?: string }> {
    return this.ipcClient.clearFinancialData();
  }

  async factoryReset(): Promise<{ ok: boolean; error?: string }> {
    return this.ipcClient.factoryReset();
  }
}
