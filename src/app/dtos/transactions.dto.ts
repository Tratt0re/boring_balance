import type {
  BooleanFlagInput,
  IdDto,
  NullableResponseDto,
  PageRequestDto,
  PaginatedResponseDto,
  RemoveResponseDto,
  RowId,
  SqliteBoolean,
  UnixTimestampMilliseconds,
  UpdateResponseDto,
} from './common.dto';
import type { CategoryType } from './categories.dto';

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

export interface TransactionGetDto extends IdDto<RowId> {}

export interface TransactionListTransactionsFiltersDto {
  readonly date_from?: UnixTimestampMilliseconds;
  readonly date_to?: UnixTimestampMilliseconds;
  readonly amount_from?: number;
  readonly amount_to?: number;
  readonly category_types?: readonly CategoryType[];
  readonly categories?: readonly RowId[];
  readonly accounts?: readonly RowId[];
  readonly settled?: BooleanFlagInput;
}

export interface TransactionListTransactionsDto extends PageRequestDto {
  readonly filters?: TransactionListTransactionsFiltersDto;
}

export interface TransactionListTransfersFiltersDto {
  readonly date_from?: UnixTimestampMilliseconds;
  readonly date_to?: UnixTimestampMilliseconds;
  readonly amount_from?: number;
  readonly amount_to?: number;
  readonly accounts?: readonly RowId[];
  readonly settled?: BooleanFlagInput;
}

export interface TransactionListTransfersDto extends PageRequestDto {
  readonly filters?: TransactionListTransfersFiltersDto;
}

export interface TransactionListResponseDto extends PaginatedResponseDto<TransactionDto> {}

export interface TransferListResponseDto extends PaginatedResponseDto<TransferDto> {}

export interface TransactionUpdateDto extends IdDto<RowId> {
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

export interface TransactionRemoveDto extends IdDto<RowId> {}

export type TransactionCreateResponse = NullableResponseDto<TransactionDto>;
export type TransactionCreateTransferResponse = TransactionCreateTransferResponseDto;
export type TransactionUpdateTransferResponse = TransactionCreateTransferResponseDto;
export type TransactionDeleteTransferResponse = RemoveResponseDto;
export type TransactionGetResponse = NullableResponseDto<TransactionDto>;
export type TransactionListTransactionsResponse = TransactionListResponseDto;
export type TransactionListTransfersResponse = TransferListResponseDto;
export type TransactionUpdateResponse = UpdateResponseDto<TransactionDto>;
export type TransactionRemoveResponse = RemoveResponseDto;
