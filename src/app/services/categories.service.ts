import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';
import { CategoryModel } from '@/models';
import { BaseIpcService } from './base-ipc.service';

export interface CategoryUpdateResult {
  readonly changed: number;
  readonly row: CategoryModel | null;
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

  async list(payload?: DTO.CategoryListDto): Promise<CategoryModel[]> {
    const rows = await this.ipcClient.list(payload);
    return rows.map((row) => CategoryModel.fromDTO(row));
  }

  async listByType(payload: DTO.CategoryListByTypeDto): Promise<CategoryModel[]> {
    const rows = await this.ipcClient.listByType(payload);
    return rows.map((row) => CategoryModel.fromDTO(row));
  }

  async listByParent(payload: DTO.CategoryListByParentDto): Promise<CategoryModel[]> {
    const rows = await this.ipcClient.listByParent(payload);
    return rows.map((row) => CategoryModel.fromDTO(row));
  }

  async listRoot(payload?: DTO.CategoryListRootDto): Promise<CategoryModel[]> {
    const rows = await this.ipcClient.listRoot(payload);
    return rows.map((row) => CategoryModel.fromDTO(row));
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
