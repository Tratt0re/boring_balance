import type { CategoryDto, CategoryType } from '@/dtos';

import type { RowId, UnixTimestampMilliseconds } from './common.model';
import {
  normalizeVisualColorKey,
  normalizeVisualIconKey,
  toBooleanFlag,
  toSqliteBooleanFlag,
} from './common.model';

export class CategoryModel {
  constructor(
    public readonly id: RowId,
    public readonly name: string,
    public readonly parentId: RowId | null,
    public readonly description: string | null,
    public readonly colorKey: string | null,
    public readonly icon: string | null,
    public readonly type: CategoryType,
    public readonly locked: boolean,
    public readonly archived: boolean,
    public readonly createdAt: UnixTimestampMilliseconds,
    public readonly updatedAt: UnixTimestampMilliseconds | null,
  ) {}

  static fromDTO(dto: CategoryDto): CategoryModel {
    return new CategoryModel(
      dto.id,
      dto.name,
      dto.parent_id,
      dto.description,
      normalizeVisualColorKey(dto.color_key),
      normalizeVisualIconKey(dto.icon),
      dto.type,
      toBooleanFlag(dto.locked),
      toBooleanFlag(dto.archived),
      dto.created_at,
      dto.updated_at,
    );
  }

  toDTO(): CategoryDto {
    return {
      id: this.id,
      name: this.name,
      parent_id: this.parentId,
      description: this.description,
      color_key: this.colorKey,
      icon: this.icon,
      type: this.type,
      locked: toSqliteBooleanFlag(this.locked),
      archived: toSqliteBooleanFlag(this.archived),
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}
