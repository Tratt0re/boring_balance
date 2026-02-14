import type {
  BooleanFlagInput,
  RemoveResponseDto,
  RowId,
  SortDirection,
  SqliteBoolean,
  UnixTimestampMilliseconds,
  UpdateResponseDto,
} from './common.dto';

export interface TransactionDto {
  readonly id: RowId;
  readonly account_id: RowId;
  readonly category_id: RowId;
  readonly occurred_at: UnixTimestampMilliseconds;
  readonly amount_cents: number;
  readonly description: string | null;
  readonly notes: string | null;
  readonly transfer_id: string | null;
  readonly settled: SqliteBoolean;
  readonly created_at: UnixTimestampMilliseconds;
  readonly updated_at: UnixTimestampMilliseconds | null;
}

export type TransactionOrderBy = 'occurred_at' | 'created_at' | 'id' | 'amount_cents';

export interface TransactionPaginationOptionsDto {
  readonly page: number;
  readonly perPage: number;
  readonly orderBy?: TransactionOrderBy;
  readonly orderDirection?: SortDirection;
}

export interface TransactionCreateDto {
  readonly occurred_at: number;
  readonly account_id: number;
  readonly category_id: number;
  readonly amount_cents: number;
  readonly description?: string | null;
  readonly notes?: string | null;
  readonly transfer_id?: string | null;
  readonly settled?: BooleanFlagInput;
}

export interface TransactionGetDto {
  readonly id: number;
}

export interface TransactionListDto {
  readonly where?: Partial<
    Pick<
      TransactionDto,
      'id' | 'account_id' | 'category_id' | 'occurred_at' | 'amount_cents' | 'description' | 'notes' | 'transfer_id' | 'settled' | 'created_at' | 'updated_at'
    >
  >;
  readonly options: TransactionPaginationOptionsDto;
}

export interface TransactionListByAccountDto {
  readonly account_id: number;
  readonly options: TransactionPaginationOptionsDto;
}

export interface TransactionListByCategoryDto {
  readonly category_id: number;
  readonly options: TransactionPaginationOptionsDto;
}

export interface TransactionListByDateRangeDto {
  readonly from?: number;
  readonly to?: number;
  readonly accountId?: number;
  readonly categoryId?: number;
  readonly settled?: BooleanFlagInput;
  readonly transferId?: string | null;
  readonly options: TransactionPaginationOptionsDto;
}

export interface TransactionListUnsettledDto {
  readonly options: TransactionPaginationOptionsDto;
}

export interface TransactionUpdateDto {
  readonly id: number;
  readonly changes: {
    readonly occurred_at?: number;
    readonly account_id?: number;
    readonly category_id?: number;
    readonly amount_cents?: number;
    readonly description?: string | null;
    readonly notes?: string | null;
    readonly transfer_id?: string | null;
    readonly settled?: BooleanFlagInput;
  };
}

export interface TransactionRemoveDto {
  readonly id: number;
}

export interface TransactionPageResponseDto {
  readonly transactions: TransactionDto[];
  readonly page: number;
  readonly perPage: number;
  readonly totalPages: number;
  readonly totalTransactions: number;
}

export type TransactionCreateResponse = TransactionDto | null;
export type TransactionGetResponse = TransactionDto | null;
export type TransactionListResponse = TransactionPageResponseDto;
export type TransactionListByAccountResponse = TransactionPageResponseDto;
export type TransactionListByCategoryResponse = TransactionPageResponseDto;
export type TransactionListByDateRangeResponse = TransactionPageResponseDto;
export type TransactionListUnsettledResponse = TransactionPageResponseDto;
export type TransactionUpdateResponse = UpdateResponseDto<TransactionDto>;
export type TransactionRemoveResponse = RemoveResponseDto;
