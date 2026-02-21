import type {
  BooleanFlagInput,
  RemoveResponseDto,
  RowId,
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
  readonly tags: readonly string[];
  readonly transfer_id: string | null;
  readonly settled: SqliteBoolean;
  readonly created_at: UnixTimestampMilliseconds;
  readonly updated_at: UnixTimestampMilliseconds | null;
}

export interface TransferDto {
  readonly id: string;
  readonly from_account_id: RowId;
  readonly to_account_id: RowId;
  readonly occurred_at: UnixTimestampMilliseconds;
  readonly amount_cents: number;
  readonly description: string | null;
  readonly settled: SqliteBoolean;
  readonly created_at: UnixTimestampMilliseconds;
  readonly updated_at: UnixTimestampMilliseconds | null;
}

export interface TransactionCreateDto {
  readonly occurred_at: UnixTimestampMilliseconds;
  readonly account_id: RowId;
  readonly category_id: RowId;
  readonly amount: number;
  readonly description?: string | null;
  readonly tags?: readonly string[];
  readonly transfer_id?: string | null;
  readonly settled?: BooleanFlagInput;
}

export interface TransactionCreateTransferDto {
  readonly occurred_at: UnixTimestampMilliseconds;
  readonly from_account_id: RowId;
  readonly to_account_id: RowId;
  readonly amount: number;
  readonly description?: string | null;
  readonly settled?: BooleanFlagInput;
}

export interface TransactionUpdateTransferDto {
  readonly transfer_id: string;
  readonly occurred_at: UnixTimestampMilliseconds;
  readonly from_account_id: RowId;
  readonly to_account_id: RowId;
  readonly amount: number;
  readonly description?: string | null;
  readonly settled?: BooleanFlagInput;
}

export interface TransactionDeleteTransferDto {
  readonly transfer_id: string;
}

export interface TransactionCreateTransferResponseDto {
  readonly transfer_id: string;
  readonly transfer: TransferDto;
  readonly transactions: readonly TransactionDto[];
}

export interface TransactionGetDto {
  readonly id: RowId;
}

export interface TransactionListTransactionsFiltersDto {
  readonly date_from?: UnixTimestampMilliseconds;
  readonly date_to?: UnixTimestampMilliseconds;
  readonly amount_from?: number;
  readonly amount_to?: number;
  readonly categories?: readonly RowId[];
  readonly accounts?: readonly RowId[];
  readonly settled?: BooleanFlagInput;
}

export interface TransactionListTransactionsDto {
  readonly filters?: TransactionListTransactionsFiltersDto;
  readonly page?: number;
  readonly page_size?: number;
}

export interface TransactionListTransfersFiltersDto {
  readonly date_from?: UnixTimestampMilliseconds;
  readonly date_to?: UnixTimestampMilliseconds;
  readonly amount_from?: number;
  readonly amount_to?: number;
  readonly accounts?: readonly RowId[];
  readonly settled?: BooleanFlagInput;
}

export interface TransactionListTransfersDto {
  readonly filters?: TransactionListTransfersFiltersDto;
  readonly page?: number;
  readonly page_size?: number;
}

export interface TransactionListResponseDto {
  readonly rows: readonly TransactionDto[];
  readonly total: number;
  readonly page: number;
  readonly page_size: number;
}

export interface TransferListResponseDto {
  readonly rows: readonly TransferDto[];
  readonly total: number;
  readonly page: number;
  readonly page_size: number;
}

export interface TransactionUpdateDto {
  readonly id: RowId;
  readonly changes: {
    readonly occurred_at?: UnixTimestampMilliseconds;
    readonly account_id?: RowId;
    readonly category_id?: RowId;
    readonly amount?: number;
    readonly description?: string | null;
    readonly tags?: readonly string[];
    readonly transfer_id?: string | null;
    readonly settled?: BooleanFlagInput;
  };
}

export interface TransactionRemoveDto {
  readonly id: RowId;
}

export type TransactionCreateResponse = TransactionDto | null;
export type TransactionCreateTransferResponse = TransactionCreateTransferResponseDto;
export type TransactionUpdateTransferResponse = TransactionCreateTransferResponseDto;
export type TransactionDeleteTransferResponse = RemoveResponseDto;
export type TransactionGetResponse = TransactionDto | null;
export type TransactionListTransactionsResponse = TransactionListResponseDto;
export type TransactionListTransfersResponse = TransferListResponseDto;
export type TransactionUpdateResponse = UpdateResponseDto<TransactionDto>;
export type TransactionRemoveResponse = RemoveResponseDto;
