import { ZARD_ICONS } from '@/shared/components/icon';
import type {
  ActionDataItem,
  ColumnDataItem,
  EditableColumnDataItem,
  TableCellAlign,
  TableCurrencyIconMode,
  TableDataItem,
} from './data-table.types';

export type TableRow = object;
export type TableRowRecord = Record<string, unknown>;

export function isRegisteredIcon(value: string): value is keyof typeof ZARD_ICONS {
  return Object.prototype.hasOwnProperty.call(ZARD_ICONS, value);
}

export function isColumnDataItem(item: TableDataItem): item is ColumnDataItem {
  return 'columnName' in item && 'columnKey' in item;
}

export function normalizeColumnAlignment(value: unknown): TableCellAlign | null {
  return value === 'left' || value === 'center' || value === 'right' ? value : null;
}

export function toCurrencyIconMode(value: unknown): TableCurrencyIconMode | null {
  return value === 'currency-trend' || value === 'transfer' || value === 'none' ? value : null;
}

export function isActionDataItem(item: TableDataItem): item is ActionDataItem {
  return 'actionItems' in item && Array.isArray(item.actionItems);
}

export function resolveSelectValue(selectedValue: string, column: EditableColumnDataItem): unknown {
  const option = column.options?.find((item) => `${item.value}` === selectedValue);
  return option ? option.value : selectedValue;
}

export function resolveComboboxValue(
  selectedValue: string | null,
  column: EditableColumnDataItem,
): unknown {
  if (selectedValue === null) {
    return null;
  }

  const option = column.options?.find((item) => `${item.value}` === selectedValue);
  return option ? option.value : selectedValue;
}

export function getRawValue(row: TableRow, columnKey: string): unknown {
  return (row as TableRowRecord)[columnKey];
}

export function toComparableString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return String(value);
}

export function toNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

export function toDateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalizedMilliseconds = Math.abs(value) < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(normalizedMilliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsedMilliseconds = Date.parse(value);
    if (Number.isNaN(parsedMilliseconds)) {
      return null;
    }

    return new Date(parsedMilliseconds);
  }

  return null;
}

export function toBooleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 1 || value === '1' || value === 'true') {
    return true;
  }

  if (value === 0 || value === '0' || value === 'false') {
    return false;
  }

  return null;
}

export function resolveTailwindFractionSize(value: string): string | null {
  if (value === 'w-full' || value === 'full') {
    return '100%';
  }

  const fractionMatch = /^(?:(?:w|min-w|max-w)-)?(\d+)\/(\d+)$/.exec(value);
  if (!fractionMatch) {
    return null;
  }

  const numerator = Number(fractionMatch[1]);
  const denominator = Number(fractionMatch[2]);
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    numerator <= 0 ||
    denominator <= 0
  ) {
    return null;
  }

  const percent = (numerator / denominator) * 100;
  if (!Number.isFinite(percent) || percent <= 0) {
    return null;
  }

  const normalizedPercent = Number(percent.toFixed(6));
  return `${normalizedPercent}%`;
}

export function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

export function hasSelectionChanged(
  previous: ReadonlySet<TableRow>,
  next: ReadonlySet<TableRow>,
): boolean {
  if (previous.size !== next.size) {
    return true;
  }

  for (const row of previous) {
    if (!next.has(row)) {
      return true;
    }
  }

  return false;
}

export function isPromiseLike(value: unknown): value is Promise<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value;
}
