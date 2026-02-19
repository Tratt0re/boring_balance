import type { AccountDto } from '@/dtos';
import {
  APP_COLOR_KEY_SET,
  APP_ICON_KEY_SET,
  DEFAULT_VISUAL_COLOR_KEY,
  DEFAULT_VISUAL_ICON_KEY,
} from '@/config/visual-options.config';

import type { RowId, UnixTimestampMilliseconds } from './common.model';
import { toBooleanFlag, toSqliteBooleanFlag } from './common.model';

function normalizeAccountColorKey(value: string | null): string {
  if (value && APP_COLOR_KEY_SET.has(value)) {
    return value;
  }

  return DEFAULT_VISUAL_COLOR_KEY;
}

function normalizeAccountIcon(value: string | null): string {
  if (value && APP_ICON_KEY_SET.has(value)) {
    return value;
  }

  return DEFAULT_VISUAL_ICON_KEY;
}

export class AccountModel {
  constructor(
    public readonly id: RowId,
    public readonly name: string,
    public readonly description: string | null,
    public readonly colorKey: string | null,
    public readonly icon: string | null,
    public readonly archived: boolean,
    public readonly createdAt: UnixTimestampMilliseconds,
    public readonly updatedAt: UnixTimestampMilliseconds | null,
  ) {}

  static fromDTO(dto: AccountDto): AccountModel {
    return new AccountModel(
      dto.id,
      dto.name,
      dto.description,
      normalizeAccountColorKey(dto.color_key),
      normalizeAccountIcon(dto.icon),
      toBooleanFlag(dto.archived),
      dto.created_at,
      dto.updated_at,
    );
  }

  toDTO(): AccountDto {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      color_key: this.colorKey,
      icon: this.icon,
      archived: toSqliteBooleanFlag(this.archived),
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}
