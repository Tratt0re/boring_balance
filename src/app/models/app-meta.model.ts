import type { AppMetaDto } from '@/dtos';

export class AppMetaModel {
  constructor(
    public readonly key: string,
    public readonly value: string,
  ) {}

  static fromDTO(dto: AppMetaDto): AppMetaModel {
    return new AppMetaModel(dto.key, dto.value);
  }

  toDTO(): AppMetaDto {
    return {
      key: this.key,
      value: this.value,
    };
  }
}
