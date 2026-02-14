import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';
import { AppMetaModel } from '@/models';
import { BaseIpcService } from './base-ipc.service';

export interface AppMetaUpdateResult {
  readonly changed: number;
  readonly row: AppMetaModel | null;
}

@Injectable({
  providedIn: 'root',
})
export class AppMetaService extends BaseIpcService<APIChannel.APP_META> {
  constructor() {
    super(APIChannel.APP_META);
  }

  async create(payload: DTO.AppMetaCreateDto): Promise<AppMetaModel | null> {
    const row = await this.ipcClient.create(payload);
    return row ? AppMetaModel.fromDTO(row) : null;
  }

  async get(payload: DTO.AppMetaGetDto): Promise<AppMetaModel | null> {
    const row = await this.ipcClient.get(payload);
    return row ? AppMetaModel.fromDTO(row) : null;
  }

  async list(payload?: DTO.AppMetaListDto): Promise<AppMetaModel[]> {
    const rows = await this.ipcClient.list(payload);
    return rows.map((row) => AppMetaModel.fromDTO(row));
  }

  async update(payload: DTO.AppMetaUpdateDto): Promise<AppMetaUpdateResult> {
    const result = await this.ipcClient.update(payload);
    return {
      changed: result.changed,
      row: result.row ? AppMetaModel.fromDTO(result.row) : null,
    };
  }

  remove(payload: DTO.AppMetaGetDto): Promise<DTO.AppMetaRemoveResponse> {
    return this.ipcClient.remove(payload);
  }

  async upsert(payload: DTO.AppMetaUpsertDto): Promise<AppMetaModel | null> {
    const row = await this.ipcClient.upsert(payload);
    return row ? AppMetaModel.fromDTO(row) : null;
  }
}
