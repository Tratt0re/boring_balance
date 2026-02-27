import type { BudgetDto } from '@/dtos';

import type { RowId, UnixTimestampMilliseconds } from './common.model';
import { amountToCents, centsToAmount, toBooleanFlag, toSqliteBooleanFlag } from './common.model';

export class BudgetModel {
  constructor(
    public readonly id: RowId,
    public readonly categoryId: RowId,
    public readonly amount: number,
    public readonly description: string | null,
    public readonly archived: boolean,
    public readonly createdAt: UnixTimestampMilliseconds,
    public readonly updatedAt: UnixTimestampMilliseconds | null,
  ) {}

  static fromDTO(dto: BudgetDto): BudgetModel {
    return new BudgetModel(
      dto.id,
      dto.category_id,
      centsToAmount(dto.amount_cents),
      dto.description,
      toBooleanFlag(dto.archived),
      dto.created_at,
      dto.updated_at,
    );
  }

  toDTO(): BudgetDto {
    return {
      id: this.id,
      category_id: this.categoryId,
      amount_cents: amountToCents(this.amount),
      description: this.description,
      archived: toSqliteBooleanFlag(this.archived),
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}
