import type { AccountValuationDto, AccountValuationSource } from '@/dtos';

import type { RowId, UnixTimestampMilliseconds } from './common.model';

function normalizeAccountValuationSource(value: string): AccountValuationSource {
  if (value === 'manual' || value === 'api' || value === 'import') {
    return value;
  }

  return 'manual';
}

export class AccountValuationModel {
  constructor(
    public readonly id: RowId,
    public readonly accountId: RowId,
    public readonly valuedAt: UnixTimestampMilliseconds,
    public readonly valueCents: number,
    public readonly source: AccountValuationSource,
    public readonly createdAt: UnixTimestampMilliseconds,
    public readonly updatedAt: UnixTimestampMilliseconds | null,
  ) {}

  static fromDTO(dto: AccountValuationDto): AccountValuationModel {
    return new AccountValuationModel(
      dto.id,
      dto.account_id,
      dto.valued_at,
      dto.value_cents,
      normalizeAccountValuationSource(dto.source),
      dto.created_at,
      dto.updated_at,
    );
  }
}
