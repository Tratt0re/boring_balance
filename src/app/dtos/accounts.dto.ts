import type {
  BooleanFlagInput,
  IdDto,
  ListQueryDto,
  NullableResponseDto,
  PageRequestWithAllDto,
  PaginatedResponseDto,
  RemoveResponseDto,
  RowId,
  SqliteBoolean,
  UnixTimestampMilliseconds,
  UpdateResponseDto,
} from './common.dto';

export type AccountType = 'cash' | 'bank' | 'savings' | 'brokerage' | 'crypto' | 'credit';
export type AccountDisplayMode = 'cashflow' | 'allocation' | 'valuation';

export interface AccountDto {
  readonly id: RowId;
  readonly name: string;
  readonly type: AccountType;
  readonly description: string | null;
  readonly color_key: string | null;
  readonly icon: string | null;
  readonly locked: SqliteBoolean;
  readonly archived: SqliteBoolean;
  readonly created_at: UnixTimestampMilliseconds;
  readonly updated_at: UnixTimestampMilliseconds | null;
}

export interface AccountCreateDto {
  readonly name: string;
  readonly type: AccountType;
  readonly description?: string | null;
  readonly color_key?: string | null;
  readonly icon?: string | null;
  readonly locked?: BooleanFlagInput;
  readonly archived?: BooleanFlagInput;
}

export interface AccountGetDto extends IdDto<RowId> {}

export interface AccountListDto
  extends ListQueryDto<
    Pick<
      AccountDto,
      'id' | 'name' | 'type' | 'description' | 'color_key' | 'icon' | 'locked' | 'archived' | 'created_at' | 'updated_at'
    >
  >,
    PageRequestWithAllDto {}

export interface AccountListResponseDto extends PaginatedResponseDto<AccountDto> {}

export interface AccountUpdateDto extends IdDto<RowId> {
  readonly changes: {
    readonly name?: string;
    readonly type?: AccountType;
    readonly description?: string | null;
    readonly color_key?: string | null;
    readonly icon?: string | null;
    readonly locked?: BooleanFlagInput;
    readonly archived?: BooleanFlagInput;
  };
}

export interface AccountRemoveDto extends IdDto<RowId> {}

export type AccountCreateResponse = NullableResponseDto<AccountDto>;
export type AccountGetResponse = NullableResponseDto<AccountDto>;
export type AccountListResponse = AccountListResponseDto;
export type AccountUpdateResponse = UpdateResponseDto<AccountDto>;
export type AccountRemoveResponse = RemoveResponseDto;
