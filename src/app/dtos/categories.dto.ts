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

export type CategoryType = 'income' | 'expense' | 'exclude';

export interface CategoryDto {
  readonly id: RowId;
  readonly name: string;
  readonly parent_id: RowId | null;
  readonly description: string | null;
  readonly color_key: string | null;
  readonly icon: string | null;
  readonly type: CategoryType;
  readonly locked: SqliteBoolean;
  readonly archived: SqliteBoolean;
  readonly created_at: UnixTimestampMilliseconds;
  readonly updated_at: UnixTimestampMilliseconds | null;
}

export interface CategoryCreateDto {
  readonly name: string;
  readonly parent_id?: number | null;
  readonly description?: string | null;
  readonly color_key?: string | null;
  readonly icon?: string | null;
  readonly type: CategoryType;
  readonly locked?: BooleanFlagInput;
  readonly archived?: BooleanFlagInput;
}

export interface CategoryGetDto extends IdDto<RowId> {}

export interface CategoryListDto
  extends ListQueryDto<
    Pick<
      CategoryDto,
      'id' | 'name' | 'parent_id' | 'description' | 'color_key' | 'icon' | 'type' | 'locked' | 'archived' | 'created_at' | 'updated_at'
    >
  >,
    PageRequestWithAllDto {}

export interface CategoryListResponseDto extends PaginatedResponseDto<CategoryDto> {}

export interface CategoryUpdateDto extends IdDto<RowId> {
  readonly changes: {
    readonly name?: string;
    readonly parent_id?: number | null;
    readonly description?: string | null;
    readonly color_key?: string | null;
    readonly icon?: string | null;
    readonly type?: CategoryType;
    readonly locked?: BooleanFlagInput;
    readonly archived?: BooleanFlagInput;
  };
}

export interface CategoryRemoveDto extends IdDto<RowId> {}

export type CategoryCreateResponse = NullableResponseDto<CategoryDto>;
export type CategoryGetResponse = NullableResponseDto<CategoryDto>;
export type CategoryListResponse = CategoryListResponseDto;
export type CategoryUpdateResponse = UpdateResponseDto<CategoryDto>;
export type CategoryRemoveResponse = RemoveResponseDto;
