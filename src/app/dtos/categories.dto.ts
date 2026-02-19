import type {
  BooleanFlagInput,
  ListQueryDto,
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

export interface CategoryGetDto {
  readonly id: number;
}

export interface CategoryListDto
  extends ListQueryDto<
    Pick<
      CategoryDto,
      'id' | 'name' | 'parent_id' | 'description' | 'color_key' | 'icon' | 'type' | 'locked' | 'archived' | 'created_at' | 'updated_at'
    >
  > {
  readonly page?: number;
  readonly page_size?: number;
  readonly all?: BooleanFlagInput;
}

export interface CategoryListResponseDto {
  readonly rows: readonly CategoryDto[];
  readonly total: number;
  readonly page: number;
  readonly page_size: number;
}

export interface CategoryUpdateDto {
  readonly id: number;
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

export interface CategoryRemoveDto {
  readonly id: number;
}

export type CategoryCreateResponse = CategoryDto | null;
export type CategoryGetResponse = CategoryDto | null;
export type CategoryListResponse = CategoryListResponseDto;
export type CategoryUpdateResponse = UpdateResponseDto<CategoryDto>;
export type CategoryRemoveResponse = RemoveResponseDto;
