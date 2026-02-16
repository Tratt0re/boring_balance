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

  async listTransactions(payload?: DTO.TransactionListTransactionsDto): Promise<readonly TransactionModel[]> {
    const rows = await this.ipcClient.listTransactions(payload);
    return rows.map((row) => TransactionModel.fromDTO(row));
  }

  async listTransfers(payload?: DTO.TransactionListTransfersDto): Promise<readonly TransactionModel[]> {
    const rows = await this.ipcClient.listTransfers(payload);
    return rows.map((row) => TransactionModel.fromDTO(row));
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
