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
import type { TransactionCreateTransferResponseDto, TransactionDto, TransferDto } from './transactions.dto';

export type PlanItemType = 'transaction' | 'transfer';
export type PlanItemFrequencyUnit = 'day' | 'week' | 'month' | 'year';
export type PlanItemMonthPolicy = 'clip' | 'skip' | 'last_day' | 'first_day';

export interface PlanItemRuleFrequencyDto {
  readonly unit: PlanItemFrequencyUnit;
  readonly interval: number;
}

export interface PlanItemRuleJsonDto {
  readonly start_date: UnixTimestampMilliseconds;
  readonly count: number;
  readonly frequency: PlanItemRuleFrequencyDto;
  readonly month_policy?: PlanItemMonthPolicy;
}

export interface PlanItemTransactionTemplateJsonDto {
  readonly amount_cents: number;
  readonly account_id: RowId;
  readonly category_id: RowId;
  readonly description: string;
  readonly settled?: SqliteBoolean;
}

export interface PlanItemTransferTemplateJsonDto {
  readonly amount_cents: number;
  readonly from_account_id: RowId;
  readonly to_account_id: RowId;
  readonly description: string;
  readonly settled?: SqliteBoolean;
}

export type PlanItemTemplateJsonDto = PlanItemTransactionTemplateJsonDto | PlanItemTransferTemplateJsonDto;

export interface PlanItemTransactionTemplateJsonInputDto {
  readonly amount_cents: number;
  readonly account_id: RowId;
  readonly category_id: RowId;
  readonly description: string;
  readonly settled?: BooleanFlagInput;
}

export interface PlanItemTransferTemplateJsonInputDto {
  readonly amount_cents: number;
  readonly from_account_id: RowId;
  readonly to_account_id: RowId;
  readonly description: string;
  readonly settled?: BooleanFlagInput;
}

export type PlanItemTemplateJsonInputDto =
  | PlanItemTransactionTemplateJsonInputDto
  | PlanItemTransferTemplateJsonInputDto;

export interface PlanItemDto {
  readonly id: RowId;
  readonly title: string;
  readonly type: PlanItemType;
  readonly template_json: PlanItemTemplateJsonDto;
  readonly rule_json: PlanItemRuleJsonDto;
  readonly created_at: UnixTimestampMilliseconds;
  readonly updated_at: UnixTimestampMilliseconds | null;
}

export interface PlanItemListFiltersDto {
  readonly type?: PlanItemType;
}

export interface PlanItemListDto extends PageRequestDto {
  readonly filters?: PlanItemListFiltersDto;
}

export interface PlanItemListResponseDto extends PaginatedResponseDto<PlanItemDto> {}

export interface PlanItemCreateBaseDto {
  readonly title: string;
  readonly rule_json: PlanItemRuleJsonDto;
  readonly create_and_run?: BooleanFlagInput;
}

export interface PlanItemCreateTransactionDto extends PlanItemCreateBaseDto {
  readonly type: 'transaction';
  readonly template_json: PlanItemTransactionTemplateJsonInputDto;
}

export interface PlanItemCreateTransferDto extends PlanItemCreateBaseDto {
  readonly type: 'transfer';
  readonly template_json: PlanItemTransferTemplateJsonInputDto;
}

export type PlanItemCreateDto = PlanItemCreateTransactionDto | PlanItemCreateTransferDto;

export interface PlanItemGetDto extends IdDto<RowId> {}

export interface PlanItemUpdateDto extends IdDto<RowId> {
  readonly changes: {
    readonly title?: string | null;
    readonly type?: PlanItemType;
    readonly template_json?: PlanItemTemplateJsonInputDto;
    readonly rule_json?: PlanItemRuleJsonDto;
  };
}

export interface PlanItemRemoveDto extends IdDto<RowId> {
  readonly delete_planned_items?: BooleanFlagInput;
}

export interface PlanItemRunDto extends IdDto<RowId> {
}

export interface PlanItemDeletePlannedItemsDto extends IdDto<RowId> {}

export interface PlanItemDeletePlannedItemsResponseDto {
  readonly plan_item_id: RowId;
  readonly deleted_transactions: number;
  readonly deleted_transfers: number;
  readonly deleted_transfer_transaction_rows: number;
  readonly total_deleted_rows: number;
}

export interface PlanItemRunSummaryDto {
  readonly total_occurrences: number;
  readonly skipped_existing: number;
  readonly would_create: number;
  readonly created: number;
}

export type PlanItemRunPreviewDto = Readonly<{ type: PlanItemType } & PlanItemTemplateJsonDto>;

export interface PlanItemRunSkippedExistingTransactionEntryDto {
  readonly occurred_at: UnixTimestampMilliseconds;
  readonly status: 'skipped_existing';
  readonly existing: {
    readonly id: RowId;
    readonly occurred_at: UnixTimestampMilliseconds;
  };
}

export interface PlanItemRunSkippedExistingTransferEntryDto {
  readonly occurred_at: UnixTimestampMilliseconds;
  readonly status: 'skipped_existing';
  readonly existing: {
    readonly transfer_id: string;
    readonly occurred_at: UnixTimestampMilliseconds;
  };
}

export interface PlanItemRunWouldCreateEntryDto {
  readonly occurred_at: UnixTimestampMilliseconds;
  readonly status: 'would_create';
  readonly preview: PlanItemRunPreviewDto;
}

export interface PlanItemRunCreatedTransactionEntryDto {
  readonly occurred_at: UnixTimestampMilliseconds;
  readonly status: 'created';
  readonly created: {
    readonly type: 'transaction';
    readonly row: TransactionDto;
  };
}

export interface PlanItemRunCreatedTransferPayloadDto extends TransactionCreateTransferResponseDto {
  readonly type: 'transfer';
}

export interface PlanItemRunCreatedTransferEntryDto {
  readonly occurred_at: UnixTimestampMilliseconds;
  readonly status: 'created';
  readonly created: PlanItemRunCreatedTransferPayloadDto;
}

export type PlanItemRunResultEntryDto =
  | PlanItemRunSkippedExistingTransactionEntryDto
  | PlanItemRunSkippedExistingTransferEntryDto
  | PlanItemRunWouldCreateEntryDto
  | PlanItemRunCreatedTransactionEntryDto
  | PlanItemRunCreatedTransferEntryDto;

export interface PlanItemRunResponseDto {
  readonly plan_item: PlanItemDto;
  readonly dry_run: boolean;
  readonly summary: PlanItemRunSummaryDto;
  readonly results: readonly PlanItemRunResultEntryDto[];
}

export interface PlanItemCreateAndRunResponseDto {
  readonly row: PlanItemDto;
  readonly run: PlanItemRunResponseDto;
}

export interface PlanItemRemoveResponseDto extends RemoveResponseDto {
  readonly deleted_planned_items?: PlanItemDeletePlannedItemsResponseDto;
}

export type PlanItemCreateResponse = PlanItemDto | PlanItemCreateAndRunResponseDto;
export type PlanItemGetResponse = NullableResponseDto<PlanItemDto>;
export type PlanItemUpdateResponse = UpdateResponseDto<PlanItemDto>;
export type PlanItemRemoveResponse = PlanItemRemoveResponseDto;
export type PlanItemRunResponse = PlanItemRunResponseDto;
export type PlanItemDeletePlannedItemsResponse = PlanItemDeletePlannedItemsResponseDto;
export type PlanItemListResponse = PlanItemListResponseDto;

export type PlanItemRunCreatedTransactionResponse = TransactionDto;
export type PlanItemRunCreatedTransferResponse = TransferDto;
