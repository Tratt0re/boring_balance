import type {
  BooleanFlagInput,
  ListQueryDto,
  ListQueryOptions,
  RemoveResponseDto,
  RowId,
  SqliteBoolean,
  UnixTimestampMilliseconds,
  UpdateResponseDto,
} from './common.dto';

export interface AccountDto {
  readonly id: RowId;
  readonly name: string;
  readonly description: string | null;
  readonly color_key: string | null;
  readonly icon: string | null;
  readonly archived: SqliteBoolean;
  readonly created_at: UnixTimestampMilliseconds;
  readonly updated_at: UnixTimestampMilliseconds | null;
}

export interface AccountCreateDto {
  readonly name: string;
  readonly description?: string | null;
  readonly color_key?: string | null;
  readonly icon?: string | null;
  readonly archived?: BooleanFlagInput;
}

export interface AccountGetDto {
  readonly id: number;
}

export type AccountListDto = ListQueryDto<
  Pick<AccountDto, 'id' | 'name' | 'description' | 'color_key' | 'icon' | 'archived' | 'created_at' | 'updated_at'>
>;

export interface AccountListActiveDto {
  readonly options?: ListQueryOptions;
}

export interface AccountUpdateDto {
  readonly id: number;
  readonly changes: {
    readonly name?: string;
    readonly description?: string | null;
    readonly color_key?: string | null;
    readonly icon?: string | null;
    readonly archived?: BooleanFlagInput;
  };
}

export interface AccountRemoveDto {
  readonly id: number;
}

export type AccountCreateResponse = AccountDto | null;
export type AccountGetResponse = AccountDto | null;
export type AccountListResponse = AccountDto[];
export type AccountListActiveResponse = AccountDto[];
export type AccountUpdateResponse = UpdateResponseDto<AccountDto>;
export type AccountRemoveResponse = RemoveResponseDto;
