import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';
import { BudgetModel } from '@/models';
import { BaseIpcService } from './base-ipc.service';
import {
  mapNullableRow,
  mapPaginatedResult,
  mapUpdateResult,
  type PaginatedResult,
  type UpdateResult,
} from './service-utils';

export type BudgetUpdateResult = UpdateResult<BudgetModel>;
export type BudgetListResult = PaginatedResult<BudgetModel>;

@Injectable({
  providedIn: 'root',
})
export class BudgetsService extends BaseIpcService<APIChannel.BUDGETS> {
  constructor() {
    super(APIChannel.BUDGETS);
  }

  async create(payload: DTO.BudgetCreateDto): Promise<BudgetModel | null> {
    const row = await this.ipcClient.create(payload);
    return mapNullableRow(row, (value) => BudgetModel.fromDTO(value));
  }

  async get(payload: DTO.BudgetGetDto): Promise<BudgetModel | null> {
    const row = await this.ipcClient.get(payload);
    return mapNullableRow(row, (value) => BudgetModel.fromDTO(value));
  }

  async list(payload?: DTO.BudgetListDto): Promise<BudgetListResult> {
    const response = await this.ipcClient.list(payload);
    return mapPaginatedResult(response, (row) => BudgetModel.fromDTO(row));
  }

  async listAll(payload?: Omit<DTO.BudgetListDto, 'page' | 'page_size' | 'all'>): Promise<readonly BudgetModel[]> {
    const response = await this.list({
      ...payload,
      all: true,
    });

    return response.rows;
  }

  async update(payload: DTO.BudgetUpdateDto): Promise<BudgetUpdateResult> {
    const result = await this.ipcClient.update(payload);
    return mapUpdateResult(result, (row) => BudgetModel.fromDTO(row));
  }

  remove(payload: DTO.BudgetRemoveDto): Promise<DTO.BudgetRemoveResponse> {
    return this.ipcClient.remove(payload);
  }
}
