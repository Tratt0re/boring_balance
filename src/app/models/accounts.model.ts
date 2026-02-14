import type { AccountDto } from '@/dtos';

import type { RowId, UnixTimestampMilliseconds } from './common.model';
import { toBooleanFlag, toSqliteBooleanFlag } from './common.model';

export class AccountModel {
  constructor(
    public readonly id: RowId,
    public readonly name: string,
    public readonly description: string | null,
    public readonly colorHex: string | null,
    public readonly archived: boolean,
    public readonly createdAt: UnixTimestampMilliseconds,
    public readonly updatedAt: UnixTimestampMilliseconds | null,
  ) {}

  static fromDTO(dto: AccountDto): AccountModel {
    return new AccountModel(
      dto.id,
      dto.name,
      dto.description,
      dto.color_hex,
      toBooleanFlag(dto.archived),
      dto.created_at,
      dto.updated_at,
    );
  }

  toDTO(): AccountDto {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      color_hex: this.colorHex,
      archived: toSqliteBooleanFlag(this.archived),
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}
