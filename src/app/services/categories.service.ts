import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';
import { CategoryModel } from '@/models';
import { BaseIpcService } from './base-ipc.service';

export interface CategoryUpdateResult {
  readonly changed: number;
  readonly row: CategoryModel | null;
}

export interface CategoryListResult {
  readonly rows: readonly CategoryModel[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

@Injectable({
  providedIn: 'root',
})
export class CategoriesService extends BaseIpcService<APIChannel.CATEGORIES> {
  constructor() {
    super(APIChannel.CATEGORIES);
  }

  async create(payload: DTO.CategoryCreateDto): Promise<CategoryModel | null> {
    const row = await this.ipcClient.create(payload);
    return row ? CategoryModel.fromDTO(row) : null;
  }

  async get(payload: DTO.CategoryGetDto): Promise<CategoryModel | null> {
    const row = await this.ipcClient.get(payload);
    return row ? CategoryModel.fromDTO(row) : null;
  }

  async list(payload?: DTO.CategoryListDto): Promise<CategoryListResult> {
    const response = await this.ipcClient.list(payload);
    const pageSize = response.page_size;

    return {
      rows: response.rows.map((row) => CategoryModel.fromDTO(row)),
      total: response.total,
      page: response.page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(response.total / pageSize)),
    };
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
    return {
      changed: result.changed,
      row: result.row ? CategoryModel.fromDTO(result.row) : null,
    };
  }

  remove(payload: DTO.CategoryRemoveDto): Promise<DTO.CategoryRemoveResponse> {
    return this.ipcClient.remove(payload);
  }
}
