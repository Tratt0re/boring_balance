import type { AccountDisplayMode, AccountDto, AccountType } from '@/dtos';
import {
  APP_COLOR_KEY_SET,
  APP_ICON_KEY_SET,
  DEFAULT_VISUAL_COLOR_KEY,
  DEFAULT_VISUAL_ICON_KEY,
} from '@/config/visual-options.config';

import type { RowId, UnixTimestampMilliseconds } from './common.model';
import { toBooleanFlag, toSqliteBooleanFlag } from './common.model';

const DEFAULT_ACCOUNT_TYPE: AccountType = 'bank';
const DEFAULT_ACCOUNT_DISPLAY_MODE: AccountDisplayMode = 'cashflow';

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

function normalizeAccountType(value: string): AccountType {
  if (
    value === 'cash' ||
    value === 'bank' ||
    value === 'savings' ||
    value === 'brokerage' ||
    value === 'crypto' ||
    value === 'credit'
  ) {
    return value;
  }

  return DEFAULT_ACCOUNT_TYPE;
}

function deriveAccountDisplayMode(type: AccountType): AccountDisplayMode {
  if (type === 'savings') {
    return 'allocation';
  }

  if (type === 'brokerage' || type === 'crypto') {
    return 'valuation';
  }

  return DEFAULT_ACCOUNT_DISPLAY_MODE;
}

export class AccountModel {
  constructor(
    public readonly id: RowId,
    public readonly name: string,
    public readonly type: AccountType,
    public readonly description: string | null,
    public readonly colorKey: string | null,
    public readonly icon: string | null,
    public readonly locked: boolean,
    public readonly archived: boolean,
    public readonly createdAt: UnixTimestampMilliseconds,
    public readonly updatedAt: UnixTimestampMilliseconds | null,
  ) {}

  static fromDTO(dto: AccountDto): AccountModel {
    return new AccountModel(
      dto.id,
      dto.name,
      normalizeAccountType(dto.type),
      dto.description,
      normalizeAccountColorKey(dto.color_key),
      normalizeAccountIcon(dto.icon),
      toBooleanFlag(dto.locked),
      toBooleanFlag(dto.archived),
      dto.created_at,
      dto.updated_at,
    );
  }

  get displayMode(): AccountDisplayMode {
    return deriveAccountDisplayMode(this.type);
  }

  toDTO(): AccountDto {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      description: this.description,
      color_key: this.colorKey,
      icon: this.icon,
      locked: toSqliteBooleanFlag(this.locked),
      archived: toSqliteBooleanFlag(this.archived),
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}
