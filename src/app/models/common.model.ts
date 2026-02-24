import {
  APP_COLOR_KEY_SET,
  APP_ICON_KEY_SET,
  DEFAULT_VISUAL_COLOR_KEY,
  DEFAULT_VISUAL_ICON_KEY,
} from '@/config/visual-options.config';
import type { SqliteBoolean } from '@/dtos';

export type UnixTimestampMilliseconds = number;
export type RowId = number;

const AMOUNT_CENTS_DIVISOR = 100;

export function toBooleanFlag(value: SqliteBoolean): boolean {
  return value === 1;
}

export function toSqliteBooleanFlag(value: boolean): SqliteBoolean {
  return value ? 1 : 0;
}

export function normalizeVisualColorKey(value: string | null): string {
  if (value && APP_COLOR_KEY_SET.has(value)) {
    return value;
  }

  return DEFAULT_VISUAL_COLOR_KEY;
}

export function normalizeVisualIconKey(value: string | null): string {
  if (value && APP_ICON_KEY_SET.has(value)) {
    return value;
  }

  return DEFAULT_VISUAL_ICON_KEY;
}

export function centsToAmount(valueInCents: number): number {
  return valueInCents / AMOUNT_CENTS_DIVISOR;
}

export function amountToCents(value: number): number {
  return Math.round(value * AMOUNT_CENTS_DIVISOR);
}
