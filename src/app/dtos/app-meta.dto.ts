import type { ListQueryDto, RemoveResponseDto, UpdateResponseDto } from './common.dto';

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

export interface AppMetaUpsertDto {
  readonly key: string;
  readonly value: string;
}

export type AppMetaCreateResponse = AppMetaDto | null;
export type AppMetaGetResponse = AppMetaDto | null;
export type AppMetaListResponse = AppMetaDto[];
export type AppMetaUpdateResponse = UpdateResponseDto<AppMetaDto>;
export type AppMetaRemoveResponse = RemoveResponseDto;
export type AppMetaUpsertResponse = AppMetaDto | null;
