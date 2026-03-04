import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';
import { AccountValuationModel } from '@/models';
import { BaseIpcService } from './base-ipc.service';
import {
  mapNullableRow,
  mapPaginatedResult,
  mapUpdateResult,
  type PaginatedResult,
  type UpdateResult,
} from './service-utils';

export type AccountValuationUpdateResult = UpdateResult<AccountValuationModel>;
export type AccountValuationListResult = PaginatedResult<AccountValuationModel>;

@Injectable({
  providedIn: 'root',
})
export class AccountValuationsService extends BaseIpcService<APIChannel.ACCOUNT_VALUATIONS> {
  constructor() {
    super(APIChannel.ACCOUNT_VALUATIONS);
  }

  async create(payload: DTO.AccountValuationCreateDto): Promise<AccountValuationModel | null> {
    const row = await this.ipcClient.create(payload);
    return mapNullableRow(row, (value) => AccountValuationModel.fromDTO(value));
  }

  async getById(payload: DTO.AccountValuationGetDto): Promise<AccountValuationModel | null> {
    const row = await this.ipcClient.get(payload);
    return mapNullableRow(row, (value) => AccountValuationModel.fromDTO(value));
  }

  async list(payload?: DTO.AccountValuationListDto): Promise<AccountValuationListResult> {
    const response = await this.ipcClient.list(payload);
    return mapPaginatedResult(response, (row) => AccountValuationModel.fromDTO(row));
  }

  async update(payload: DTO.AccountValuationUpdateDto): Promise<AccountValuationUpdateResult> {
    const result = await this.ipcClient.update(payload);
    return mapUpdateResult(result, (row) => AccountValuationModel.fromDTO(row));
  }

  remove(payload: DTO.AccountValuationRemoveDto): Promise<DTO.AccountValuationRemoveResponse> {
    return this.ipcClient.remove(payload);
  }

  async getLatestByAccount(payload: DTO.AccountValuationGetLatestByAccountDto): Promise<AccountValuationModel | null> {
    const row = await this.ipcClient.getLatestByAccount(payload);
    return mapNullableRow(row, (value) => AccountValuationModel.fromDTO(value));
  }
}
