import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';
import { CategoryModel } from '@/models';
import { BaseIpcService } from './base-ipc.service';
import {
  mapNullableRow,
  mapPaginatedResult,
  mapUpdateResult,
  type PaginatedResult,
  type UpdateResult,
} from './service-utils';

export type CategoryUpdateResult = UpdateResult<CategoryModel>;
export type CategoryListResult = PaginatedResult<CategoryModel>;

@Injectable({
  providedIn: 'root',
})
export class CategoriesService extends BaseIpcService<APIChannel.CATEGORIES> {
  constructor() {
    super(APIChannel.CATEGORIES);
  }

  async create(payload: DTO.CategoryCreateDto): Promise<CategoryModel | null> {
    const row = await this.ipcClient.create(payload);
    return mapNullableRow(row, (value) => CategoryModel.fromDTO(value));
  }

  async get(payload: DTO.CategoryGetDto): Promise<CategoryModel | null> {
    const row = await this.ipcClient.get(payload);
    return mapNullableRow(row, (value) => CategoryModel.fromDTO(value));
  }

  async list(payload?: DTO.CategoryListDto): Promise<CategoryListResult> {
    const response = await this.ipcClient.list(payload);
    return mapPaginatedResult(response, (row) => CategoryModel.fromDTO(row));
  }

  async listAll(
    payload?: Omit<DTO.CategoryListDto, 'page' | 'page_size' | 'all'>,
  ): Promise<readonly CategoryModel[]> {
    const response = await this.list({
      ...payload,
      all: true,
    });

    return response.rows;
  }

  async update(payload: DTO.CategoryUpdateDto): Promise<CategoryUpdateResult> {
    const result = await this.ipcClient.update(payload);
    return mapUpdateResult(result, (row) => CategoryModel.fromDTO(row));
  }

  remove(payload: DTO.CategoryRemoveDto): Promise<DTO.CategoryRemoveResponse> {
    return this.ipcClient.remove(payload);
  }
}
