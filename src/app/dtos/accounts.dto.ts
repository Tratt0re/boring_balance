import type {
  BooleanFlagInput,
  ListQueryDto,
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

export interface AccountGetDto {
  readonly id: number;
}

export interface AccountListDto
  extends ListQueryDto<
    Pick<
      AccountDto,
      'id' | 'name' | 'type' | 'description' | 'color_key' | 'icon' | 'locked' | 'archived' | 'created_at' | 'updated_at'
    >
  > {
  readonly page?: number;
  readonly page_size?: number;
  readonly all?: BooleanFlagInput;
}

export interface AccountListResponseDto {
  readonly rows: readonly AccountDto[];
  readonly total: number;
  readonly page: number;
  readonly page_size: number;
}

export interface AccountUpdateDto {
  readonly id: number;
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

export interface AccountRemoveDto {
  readonly id: number;
}

export type AccountCreateResponse = AccountDto | null;
export type AccountGetResponse = AccountDto | null;
export type AccountListResponse = AccountListResponseDto;
export type AccountUpdateResponse = UpdateResponseDto<AccountDto>;
export type AccountRemoveResponse = RemoveResponseDto;
