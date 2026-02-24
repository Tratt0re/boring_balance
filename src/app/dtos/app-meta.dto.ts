import type { ListQueryDto, NullableResponseDto, RemoveResponseDto, UpdateResponseDto } from './common.dto';

export interface AppMetaDto {
  readonly key: string;
  readonly value: string;
}

export interface AppMetaCreateDto {
  readonly key: string;
  readonly value: string;
}

export interface AppMetaGetDto {
  readonly key: string;
}

export type AppMetaListDto = ListQueryDto<Pick<AppMetaDto, 'key' | 'value'>>;

export interface AppMetaUpdateDto {
  readonly key: string;
  readonly changes: {
    readonly value: string;
  };
}

export type AppMetaUpsertDto = AppMetaCreateDto;

export type AppMetaCreateResponse = NullableResponseDto<AppMetaDto>;
export type AppMetaGetResponse = NullableResponseDto<AppMetaDto>;
export type AppMetaListResponse = AppMetaDto[];
export type AppMetaUpdateResponse = UpdateResponseDto<AppMetaDto>;
export type AppMetaRemoveResponse = RemoveResponseDto;
export type AppMetaUpsertResponse = NullableResponseDto<AppMetaDto>;
