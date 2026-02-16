import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';
import { AccountModel } from '@/models';
import { BaseIpcService } from './base-ipc.service';

export interface AccountUpdateResult {
  readonly changed: number;
  readonly row: AccountModel | null;
}

@Injectable({
  providedIn: 'root',
})
export class AccountsService extends BaseIpcService<APIChannel.ACCOUNTS> {
  constructor() {
    super(APIChannel.ACCOUNTS);
  }

  async create(payload: DTO.AccountCreateDto): Promise<AccountModel | null> {
    const row = await this.ipcClient.create(payload);
    return row ? AccountModel.fromDTO(row) : null;
  }

  async get(payload: DTO.AccountGetDto): Promise<AccountModel | null> {
    const row = await this.ipcClient.get(payload);
    return row ? AccountModel.fromDTO(row) : null;
  }

  async list(payload?: DTO.AccountListDto): Promise<AccountModel[]> {
    const rows = await this.ipcClient.list(payload);
    return rows.map((row) => AccountModel.fromDTO(row));
  }

  async update(payload: DTO.AccountUpdateDto): Promise<AccountUpdateResult> {
    const result = await this.ipcClient.update(payload);
    return {
      changed: result.changed,
      row: result.row ? AccountModel.fromDTO(result.row) : null,
    };
  }

  remove(payload: DTO.AccountRemoveDto): Promise<DTO.AccountRemoveResponse> {
    return this.ipcClient.remove(payload);
  }
}
