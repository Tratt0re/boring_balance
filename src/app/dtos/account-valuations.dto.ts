import type {
  IdDto,
  ListQueryDto,
  NullableResponseDto,
  PageRequestWithAllDto,
  PaginatedResponseDto,
  RemoveResponseDto,
  RowId,
  UnixTimestampMilliseconds,
  UpdateResponseDto,
} from './common.dto';

export type AccountValuationSource = 'manual' | 'api' | 'import';

export interface AccountValuationDto {
  readonly id: RowId;
  readonly account_id: RowId;
  readonly valued_at: UnixTimestampMilliseconds;
  readonly value_cents: number;
  readonly source: AccountValuationSource;
  readonly created_at: UnixTimestampMilliseconds;
  readonly updated_at: UnixTimestampMilliseconds | null;
}

export interface AccountValuationCreateDto {
  readonly account_id: number;
  readonly valued_at: UnixTimestampMilliseconds;
  readonly value_cents: number;
  readonly source?: AccountValuationSource;
}

export interface AccountValuationGetDto extends IdDto<RowId> {}

export interface AccountValuationListDto
  extends ListQueryDto<Pick<AccountValuationDto, 'id' | 'account_id' | 'valued_at' | 'value_cents' | 'source'>>,
    PageRequestWithAllDto {}

export interface AccountValuationUpdateDto extends IdDto<RowId> {
  readonly changes: {
    readonly valued_at?: UnixTimestampMilliseconds;
    readonly value_cents?: number;
  };
}

export interface AccountValuationRemoveDto extends IdDto<RowId> {}

export interface AccountValuationGetLatestByAccountDto {
  readonly account_id: number;
}

export type AccountValuationCreateResponse = NullableResponseDto<AccountValuationDto>;
export type AccountValuationGetResponse = NullableResponseDto<AccountValuationDto>;
export type AccountValuationListResponse = PaginatedResponseDto<AccountValuationDto>;
export type AccountValuationUpdateResponse = UpdateResponseDto<AccountValuationDto>;
export type AccountValuationRemoveResponse = RemoveResponseDto;
export type AccountValuationGetLatestByAccountResponse = NullableResponseDto<AccountValuationDto>;
