import type { SqliteBoolean } from '@/dtos';

export type UnixTimestampMilliseconds = number;
export type RowId = number;

export function toBooleanFlag(value: SqliteBoolean): boolean {
  return value === 1;
}

export function toSqliteBooleanFlag(value: boolean): SqliteBoolean {
  return value ? 1 : 0;
}
