import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';
import { TransactionModel } from '@/models';
import { BaseIpcService } from './base-ipc.service';

export interface TransactionTransferResult {
  readonly transferId: string;
  readonly transactions: readonly TransactionModel[];
}

export interface TransactionUpdateResult {
  readonly changed: number;
  readonly row: TransactionModel | null;
}

export interface TransactionListResult {
  readonly rows: readonly TransactionModel[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

@Injectable({
  providedIn: 'root',
})
export class TransactionsService extends BaseIpcService<APIChannel.TRANSACTIONS> {
  constructor() {
    super(APIChannel.TRANSACTIONS);
  }

  async create(payload: DTO.TransactionCreateDto): Promise<TransactionModel | null> {
    const row = await this.ipcClient.create(payload);
    return row ? TransactionModel.fromDTO(row) : null;
  }

  async createTransfer(payload: DTO.TransactionCreateTransferDto): Promise<TransactionTransferResult> {
    const transfer = await this.ipcClient.createTransfer(payload);
    return {
      transferId: transfer.transfer_id,
      transactions: transfer.transactions.map((row) => TransactionModel.fromDTO(row)),
    };
  }

  async updateTransfer(payload: DTO.TransactionUpdateTransferDto): Promise<TransactionTransferResult> {
    const transfer = await this.ipcClient.updateTransfer(payload);
    return {
      transferId: transfer.transfer_id,
      transactions: transfer.transactions.map((row) => TransactionModel.fromDTO(row)),
    };
  }

  deleteTransfer(payload: DTO.TransactionDeleteTransferDto): Promise<DTO.TransactionDeleteTransferResponse> {
    return this.ipcClient.deleteTransfer(payload);
  }

  async get(payload: DTO.TransactionGetDto): Promise<TransactionModel | null> {
    const row = await this.ipcClient.get(payload);
    return row ? TransactionModel.fromDTO(row) : null;
  }

  async listTransactions(payload?: DTO.TransactionListTransactionsDto): Promise<TransactionListResult> {
    const response = await this.ipcClient.listTransactions(payload);
    const pageSize = response.page_size;

    return {
      rows: response.rows.map((row) => TransactionModel.fromDTO(row)),
      total: response.total,
      page: response.page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(response.total / pageSize)),
    };
  }

  async listTransfers(payload?: DTO.TransactionListTransfersDto): Promise<TransactionListResult> {
    const response = await this.ipcClient.listTransfers(payload);
    const pageSize = response.page_size;

    return {
      rows: response.rows.map((row) => TransactionModel.fromDTO(row)),
      total: response.total,
      page: response.page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(response.total / pageSize)),
    };
  }

  async update(payload: DTO.TransactionUpdateDto): Promise<TransactionUpdateResult> {
    const result = await this.ipcClient.update(payload);
    return {
      changed: result.changed,
      row: result.row ? TransactionModel.fromDTO(result.row) : null,
    };
  }

  remove(payload: DTO.TransactionRemoveDto): Promise<DTO.TransactionRemoveResponse> {
    return this.ipcClient.remove(payload);
  }
}
