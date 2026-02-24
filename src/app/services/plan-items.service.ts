import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';
import { PlanItemModel, TransactionModel, TransferModel } from '@/models';

import { BaseIpcService } from './base-ipc.service';

export interface PlanItemUpdateResult {
  readonly changed: number;
  readonly row: PlanItemModel | null;
}

export interface PlanItemListResult {
  readonly rows: readonly PlanItemModel[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export interface PlanItemDeletePlannedItemsResult {
  readonly planItemId: number;
  readonly deletedTransactions: number;
  readonly deletedTransfers: number;
  readonly deletedTransferTransactionRows: number;
  readonly totalDeletedRows: number;
}

export interface PlanItemRemoveResult {
  readonly changed: number;
  readonly deletedPlannedItems?: PlanItemDeletePlannedItemsResult;
}

export interface PlanItemRunSummaryResult {
  readonly totalOccurrences: number;
  readonly skippedExisting: number;
  readonly wouldCreate: number;
  readonly created: number;
}

export interface PlanItemRunSkippedExistingTransactionResult {
  readonly id: number;
  readonly occurredAt: number;
}

export interface PlanItemRunSkippedExistingTransferResult {
  readonly transferId: string;
  readonly occurredAt: number;
}

export interface PlanItemRunSkippedExistingEntryResult {
  readonly occurredAt: number;
  readonly status: 'skipped_existing';
  readonly existing: PlanItemRunSkippedExistingTransactionResult | PlanItemRunSkippedExistingTransferResult;
}

export interface PlanItemRunWouldCreateEntryResult {
  readonly occurredAt: number;
  readonly status: 'would_create';
  readonly preview: DTO.PlanItemRunPreviewDto;
}

export interface PlanItemRunCreatedTransactionPayloadResult {
  readonly type: 'transaction';
  readonly row: TransactionModel;
}

export interface PlanItemRunCreatedTransferPayloadResult {
  readonly type: 'transfer';
  readonly transferId: string;
  readonly transfer: TransferModel;
  readonly transactions: readonly TransactionModel[];
}

export interface PlanItemRunCreatedEntryResult {
  readonly occurredAt: number;
  readonly status: 'created';
  readonly created: PlanItemRunCreatedTransactionPayloadResult | PlanItemRunCreatedTransferPayloadResult;
}

export type PlanItemRunEntryResult =
  | PlanItemRunSkippedExistingEntryResult
  | PlanItemRunWouldCreateEntryResult
  | PlanItemRunCreatedEntryResult;

export interface PlanItemRunResult {
  readonly planItem: PlanItemModel;
  readonly dryRun: boolean;
  readonly summary: PlanItemRunSummaryResult;
  readonly results: readonly PlanItemRunEntryResult[];
}

export interface PlanItemCreateAndRunResult {
  readonly row: PlanItemModel;
  readonly run: PlanItemRunResult;
}

export type PlanItemCreateResult = PlanItemModel | PlanItemCreateAndRunResult;

function isPlanItemCreateAndRunResponse(
  value: DTO.PlanItemCreateResponse,
): value is DTO.PlanItemCreateAndRunResponseDto {
  return Boolean(value && typeof value === 'object' && 'row' in value && 'run' in value);
}

@Injectable({
  providedIn: 'root',
})
export class PlanItemsService extends BaseIpcService<APIChannel.PLAN_ITEMS> {
  constructor() {
    super(APIChannel.PLAN_ITEMS);
  }

  private mapDeletePlannedItemsResult(
    result: DTO.PlanItemDeletePlannedItemsResponse,
  ): PlanItemDeletePlannedItemsResult {
    return {
      planItemId: result.plan_item_id,
      deletedTransactions: result.deleted_transactions,
      deletedTransfers: result.deleted_transfers,
      deletedTransferTransactionRows: result.deleted_transfer_transaction_rows,
      totalDeletedRows: result.total_deleted_rows,
    };
  }

  private mapRunSummaryResult(summary: DTO.PlanItemRunSummaryDto): PlanItemRunSummaryResult {
    return {
      totalOccurrences: summary.total_occurrences,
      skippedExisting: summary.skipped_existing,
      wouldCreate: summary.would_create,
      created: summary.created,
    };
  }

  private mapRunEntryResult(entry: DTO.PlanItemRunResultEntryDto): PlanItemRunEntryResult {
    if (entry.status === 'skipped_existing') {
      if ('id' in entry.existing) {
        return {
          occurredAt: entry.occurred_at,
          status: 'skipped_existing',
          existing: {
            id: entry.existing.id,
            occurredAt: entry.existing.occurred_at,
          },
        };
      }

      return {
        occurredAt: entry.occurred_at,
        status: 'skipped_existing',
        existing: {
          transferId: entry.existing.transfer_id,
          occurredAt: entry.existing.occurred_at,
        },
      };
    }

    if (entry.status === 'would_create') {
      return {
        occurredAt: entry.occurred_at,
        status: 'would_create',
        preview: {
          ...entry.preview,
        },
      };
    }

    if (entry.created.type === 'transaction') {
      return {
        occurredAt: entry.occurred_at,
        status: 'created',
        created: {
          type: 'transaction',
          row: TransactionModel.fromDTO(entry.created.row),
        },
      };
    }

    return {
      occurredAt: entry.occurred_at,
      status: 'created',
      created: {
        type: 'transfer',
        transferId: entry.created.transfer_id,
        transfer: TransferModel.fromDTO(entry.created.transfer),
        transactions: entry.created.transactions.map((row) => TransactionModel.fromDTO(row)),
      },
    };
  }

  private mapRunResult(result: DTO.PlanItemRunResponse): PlanItemRunResult {
    return {
      planItem: PlanItemModel.fromDTO(result.plan_item),
      dryRun: result.dry_run,
      summary: this.mapRunSummaryResult(result.summary),
      results: result.results.map((entry) => this.mapRunEntryResult(entry)),
    };
  }

  async create(payload: DTO.PlanItemCreateDto): Promise<PlanItemCreateResult> {
    const result = await this.ipcClient.create(payload);

    if (isPlanItemCreateAndRunResponse(result)) {
      return {
        row: PlanItemModel.fromDTO(result.row),
        run: this.mapRunResult(result.run),
      };
    }

    return PlanItemModel.fromDTO(result);
  }

  async get(payload: DTO.PlanItemGetDto): Promise<PlanItemModel | null> {
    const row = await this.ipcClient.get(payload);
    return row ? PlanItemModel.fromDTO(row) : null;
  }

  async list(payload?: DTO.PlanItemListDto): Promise<PlanItemListResult> {
    const response = await this.ipcClient.list(payload);
    const pageSize = response.page_size;

    return {
      rows: response.rows.map((row) => PlanItemModel.fromDTO(row)),
      total: response.total,
      page: response.page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(response.total / pageSize)),
    };
  }

  async update(payload: DTO.PlanItemUpdateDto): Promise<PlanItemUpdateResult> {
    const result = await this.ipcClient.update(payload);

    return {
      changed: result.changed,
      row: result.row ? PlanItemModel.fromDTO(result.row) : null,
    };
  }

  async remove(payload: DTO.PlanItemRemoveDto): Promise<PlanItemRemoveResult> {
    const result = await this.ipcClient.remove(payload);

    return {
      changed: result.changed,
      ...(result.deleted_planned_items
        ? { deletedPlannedItems: this.mapDeletePlannedItemsResult(result.deleted_planned_items) }
        : {}),
    };
  }

  async run(payload: DTO.PlanItemRunDto): Promise<PlanItemRunResult> {
    const result = await this.ipcClient.run(payload);
    return this.mapRunResult(result);
  }

  async deletePlannedItems(payload: DTO.PlanItemDeletePlannedItemsDto): Promise<PlanItemDeletePlannedItemsResult> {
    const result = await this.ipcClient.deletePlannedItems(payload);
    return this.mapDeletePlannedItemsResult(result);
  }
}
