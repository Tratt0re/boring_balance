import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';
import { AccountModel } from '@/models';
import { BaseIpcService } from './base-ipc.service';

export interface AccountUpdateResult {
  readonly changed: number;
  readonly row: AccountModel | null;
}

export interface AccountListResult {
  readonly rows: readonly AccountModel[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
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

  async list(payload?: DTO.AccountListDto): Promise<AccountListResult> {
    const response = await this.ipcClient.list(payload);
    const pageSize = response.page_size;

    return {
      rows: response.rows.map((row) => AccountModel.fromDTO(row)),
      total: response.total,
      page: response.page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(response.total / pageSize)),
    };
  }

  async listAll(payload?: Omit<DTO.AccountListDto, 'page' | 'page_size' | 'all'>): Promise<readonly AccountModel[]> {
    const response = await this.list({
      ...payload,
      all: true,
    });

    return response.rows;
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
