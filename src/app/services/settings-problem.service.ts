import { Injectable } from '@angular/core';

import { APIChannel, type SettingsProblem } from '@/config/api';
import { BaseIpcService } from './base-ipc.service';

@Injectable({
  providedIn: 'root',
})
export class SettingsProblemService extends BaseIpcService<APIChannel.SETTINGS> {
  constructor() {
    super(APIChannel.SETTINGS);
  }

  async getProblem(): Promise<SettingsProblem | null> {
    return this.ipcClient.getProblem();
  }

  async acknowledgeProblem(): Promise<void> {
    return this.ipcClient.acknowledgeProblem();
  }
}
