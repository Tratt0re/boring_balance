import type { TransactionDto } from '@/dtos';

import type { RowId, UnixTimestampMilliseconds } from './common.model';
import { amountToCents, centsToAmount, toBooleanFlag, toSqliteBooleanFlag } from './common.model';

export class TransactionModel {
  constructor(
    public readonly id: RowId,
    public readonly accountId: RowId,
    public readonly categoryId: RowId,
    public readonly occurredAt: UnixTimestampMilliseconds,
    public readonly amount: number,
    public readonly description: string | null,
    public readonly tags: readonly string[],
    public readonly transferId: string | null,
    public readonly settled: boolean,
    public readonly createdAt: UnixTimestampMilliseconds,
    public readonly updatedAt: UnixTimestampMilliseconds | null,
  ) {}

  static fromDTO(dto: TransactionDto): TransactionModel {
    return new TransactionModel(
      dto.id,
      dto.account_id,
      dto.category_id,
      dto.occurred_at,
      centsToAmount(dto.amount_cents),
      dto.description,
      [...dto.tags],
      dto.transfer_id,
      toBooleanFlag(dto.settled),
      dto.created_at,
      dto.updated_at,
    );
  }

  toDTO(): TransactionDto {
    return {
      id: this.id,
      account_id: this.accountId,
      category_id: this.categoryId,
      occurred_at: this.occurredAt,
      amount_cents: amountToCents(this.amount),
      description: this.description,
      tags: [...this.tags],
      transfer_id: this.transferId,
      settled: toSqliteBooleanFlag(this.settled),
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}
