import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';
import { TransactionModel, TransferModel } from '@/models';
import { BaseIpcService } from './base-ipc.service';
import {
  mapNullableRow,
  mapPaginatedResult,
  mapTransferBundleResult,
  mapUpdateResult,
  type PaginatedResult,
  type TransferBundleResult,
  type UpdateResult,
} from './service-utils';

export type TransactionTransferResult = TransferBundleResult<TransferModel, TransactionModel>;
export type TransactionUpdateResult = UpdateResult<TransactionModel>;
export type TransactionListResult = PaginatedResult<TransactionModel>;
export type TransferListResult = PaginatedResult<TransferModel>;

@Injectable({
  providedIn: 'root',
})
export class TransactionsService extends BaseIpcService<APIChannel.TRANSACTIONS> {
  constructor() {
    super(APIChannel.TRANSACTIONS);
  }

  async create(payload: DTO.TransactionCreateDto): Promise<TransactionModel | null> {
    const row = await this.ipcClient.create(payload);
    return mapNullableRow(row, (value) => TransactionModel.fromDTO(value));
  }

  async createTransfer(payload: DTO.TransactionCreateTransferDto): Promise<TransactionTransferResult> {
    const transfer = await this.ipcClient.createTransfer(payload);
    return mapTransferBundleResult(
      transfer,
      (row) => TransferModel.fromDTO(row),
      (row) => TransactionModel.fromDTO(row),
    );
  }

  async updateTransfer(payload: DTO.TransactionUpdateTransferDto): Promise<TransactionTransferResult> {
    const transfer = await this.ipcClient.updateTransfer(payload);
    return mapTransferBundleResult(
      transfer,
      (row) => TransferModel.fromDTO(row),
      (row) => TransactionModel.fromDTO(row),
    );
  }

  deleteTransfer(payload: DTO.TransactionDeleteTransferDto): Promise<DTO.TransactionDeleteTransferResponse> {
    return this.ipcClient.deleteTransfer(payload);
  }

  async get(payload: DTO.TransactionGetDto): Promise<TransactionModel | null> {
    const row = await this.ipcClient.get(payload);
    return mapNullableRow(row, (value) => TransactionModel.fromDTO(value));
  }

  async listTransactions(payload?: DTO.TransactionListTransactionsDto): Promise<TransactionListResult> {
    const response = await this.ipcClient.listTransactions(payload);
    return mapPaginatedResult(response, (row) => TransactionModel.fromDTO(row));
  }

  async listTransfers(payload?: DTO.TransactionListTransfersDto): Promise<TransferListResult> {
    const response = await this.ipcClient.listTransfers(payload);
    return mapPaginatedResult(response, (row) => TransferModel.fromDTO(row));
  }

  async update(payload: DTO.TransactionUpdateDto): Promise<TransactionUpdateResult> {
    const result = await this.ipcClient.update(payload);
    return mapUpdateResult(result, (row) => TransactionModel.fromDTO(row));
  }

  remove(payload: DTO.TransactionRemoveDto): Promise<DTO.TransactionRemoveResponse> {
    return this.ipcClient.remove(payload);
  }
}
