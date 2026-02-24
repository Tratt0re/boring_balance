import type { TransferDto } from '@/dtos';

import type { RowId, UnixTimestampMilliseconds } from './common.model';
import { amountToCents, centsToAmount, toBooleanFlag, toSqliteBooleanFlag } from './common.model';

export class TransferModel {
  constructor(
    public readonly transferId: string,
    public readonly occurredAt: UnixTimestampMilliseconds,
    public readonly fromAccountId: RowId,
    public readonly toAccountId: RowId,
    public readonly amount: number,
    public readonly description: string | null,
    public readonly settled: boolean,
    public readonly createdAt: UnixTimestampMilliseconds,
    public readonly updatedAt: UnixTimestampMilliseconds | null,
  ) {}

  static fromDTO(dto: TransferDto): TransferModel {
    return new TransferModel(
      dto.id,
      dto.occurred_at,
      dto.from_account_id,
      dto.to_account_id,
      centsToAmount(dto.amount_cents),
      dto.description,
      toBooleanFlag(dto.settled),
      dto.created_at,
      dto.updated_at,
    );
  }

  toDTO(): TransferDto {
    return {
      id: this.transferId,
      occurred_at: this.occurredAt,
      from_account_id: this.fromAccountId,
      to_account_id: this.toAccountId,
      amount_cents: amountToCents(this.amount),
      description: this.description,
      settled: toSqliteBooleanFlag(this.settled),
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}
