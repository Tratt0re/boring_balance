import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';
import { AccountModel } from '@/models';
import { BaseIpcService } from './base-ipc.service';
import {
  mapNullableRow,
  mapPaginatedResult,
  mapUpdateResult,
  type PaginatedResult,
  type UpdateResult,
} from './service-utils';

export type AccountUpdateResult = UpdateResult<AccountModel>;
export type AccountListResult = PaginatedResult<AccountModel>;

@Injectable({
  providedIn: 'root',
})
export class AccountsService extends BaseIpcService<APIChannel.ACCOUNTS> {
  constructor() {
    super(APIChannel.ACCOUNTS);
  }

  async create(payload: DTO.AccountCreateDto): Promise<AccountModel | null> {
    const row = await this.ipcClient.create(payload);
    return mapNullableRow(row, (value) => AccountModel.fromDTO(value));
  }

  async get(payload: DTO.AccountGetDto): Promise<AccountModel | null> {
    const row = await this.ipcClient.get(payload);
    return mapNullableRow(row, (value) => AccountModel.fromDTO(value));
  }

  async list(payload?: DTO.AccountListDto): Promise<AccountListResult> {
    const response = await this.ipcClient.list(payload);
    return mapPaginatedResult(response, (row) => AccountModel.fromDTO(row));
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
    return mapUpdateResult(result, (row) => AccountModel.fromDTO(row));
  }

  remove(payload: DTO.AccountRemoveDto): Promise<DTO.AccountRemoveResponse> {
    return this.ipcClient.remove(payload);
  }
}
