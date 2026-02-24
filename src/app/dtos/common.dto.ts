export type SqliteBoolean = 0 | 1;
export type UnixTimestampMilliseconds = number;
export type RowId = number;
export type BooleanFlagInput = boolean | SqliteBoolean;
export type SortDirection = 'ASC' | 'DESC';
export type NullableResponseDto<T> = T | null;

export interface IdDto<TId = RowId> {
  readonly id: TId;
}

export interface ListQueryOptions {
  readonly orderBy?: string;
  readonly orderDirection?: SortDirection;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ListQueryDto<TWhere extends Record<string, unknown>> {
  readonly where?: Partial<TWhere>;
  readonly options?: ListQueryOptions;
}

export interface PageRequestDto {
  readonly page?: number;
  readonly page_size?: number;
}

export interface PageRequestWithAllDto extends PageRequestDto {
  readonly all?: BooleanFlagInput;
}

export interface PaginatedResponseDto<TRow> {
  readonly rows: readonly TRow[];
  readonly total: number;
  readonly page: number;
  readonly page_size: number;
}

export interface UpdateResponseDto<TDto> {
  readonly changed: number;
  readonly row: TDto | null;
}

export interface RemoveResponseDto {
  readonly changed: number;
}
