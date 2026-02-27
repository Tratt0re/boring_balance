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

export interface BudgetDto {
  readonly id: RowId;
  readonly category_id: RowId;
  readonly amount_cents: number;
  readonly description: string | null;
  readonly archived: SqliteBoolean;
  readonly created_at: UnixTimestampMilliseconds;
  readonly updated_at: UnixTimestampMilliseconds | null;
}

export interface BudgetCreateDto {
  readonly category_id: RowId;
  readonly amount_cents: number;
  readonly description?: string | null;
}

export interface BudgetGetDto extends IdDto<RowId> {}

export interface BudgetListDto
  extends ListQueryDto<
    Pick<
      BudgetDto,
      'id' | 'category_id' | 'amount_cents' | 'description' | 'archived' | 'created_at' | 'updated_at'
    >
  >,
    PageRequestWithAllDto {}

export interface BudgetListResponseDto extends PaginatedResponseDto<BudgetDto> {}

export interface BudgetUpdateDto extends IdDto<RowId> {
  readonly changes: {
    readonly category_id?: RowId;
    readonly amount_cents?: number;
    readonly description?: string | null;
    readonly archived?: BooleanFlagInput;
  };
}

export interface BudgetRemoveDto extends IdDto<RowId> {}

export type BudgetCreateResponse = NullableResponseDto<BudgetDto>;
export type BudgetGetResponse = NullableResponseDto<BudgetDto>;
export type BudgetListResponse = BudgetListResponseDto;
export type BudgetUpdateResponse = UpdateResponseDto<BudgetDto>;
export type BudgetRemoveResponse = RemoveResponseDto;
