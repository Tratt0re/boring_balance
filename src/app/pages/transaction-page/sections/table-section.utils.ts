import {
  APP_COLOR_OPTIONS,
  APP_ICON_OPTIONS,
  DEFAULT_VISUAL_COLOR_KEY,
  DEFAULT_VISUAL_ICON_KEY,
} from '@/config/visual-options.config';
import type { ZardIcon } from '@/shared/components/icon';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/shared/utils/pagination-utils';

const APP_ICON_BY_VALUE = new Map(
  APP_ICON_OPTIONS.map((option) => [option.value, option.icon ?? null] as const),
);
const APP_COLOR_HEX_BY_VALUE = new Map(
  APP_COLOR_OPTIONS.map((option) => [option.value, option.colorHex ?? null] as const),
);
const DEFAULT_TABLE_ICON = (APP_ICON_BY_VALUE.get(DEFAULT_VISUAL_ICON_KEY) ?? 'circle') as ZardIcon;
const DEFAULT_TABLE_COLOR_HEX =
  APP_COLOR_HEX_BY_VALUE.get(DEFAULT_VISUAL_COLOR_KEY) ?? `var(--${DEFAULT_VISUAL_COLOR_KEY})`;

export const resolveIconByValue = (value: string | null): ZardIcon | null => {
  if (!value || value.length === 0) {
    return DEFAULT_TABLE_ICON;
  }

  return APP_ICON_BY_VALUE.get(value) ?? DEFAULT_TABLE_ICON;
};

export const resolveColorHexByValue = (value: string | null): string | null => {
  if (!value || value.length === 0) {
    return DEFAULT_TABLE_COLOR_HEX;
  }

  return APP_COLOR_HEX_BY_VALUE.get(value) ?? DEFAULT_TABLE_COLOR_HEX;
};

export const toCurrentMonthDateRange = (
  referenceDate: Date = new Date(),
): { dateFrom: Date; dateTo: Date } => {
  const year = referenceDate.getFullYear();
  const monthIndex = referenceDate.getMonth();

  return {
    dateFrom: new Date(year, monthIndex, 1, 0, 0, 0, 0),
    dateTo: new Date(year, monthIndex + 1, 0, 23, 59, 59, 999),
  };
};

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

export function toPositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsedValue = Number.parseInt(value, 10);
    return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
  }

  return null;
}

export function toPositiveIntegerArray(value: unknown): readonly number[] {
  if (Array.isArray(value)) {
    const uniqueValues = new Set<number>();

    for (const item of value) {
      const parsedValue = toPositiveInteger(item);
      if (parsedValue) {
        uniqueValues.add(parsedValue);
      }
    }

    return Array.from(uniqueValues);
  }

  const parsedValue = toPositiveInteger(value);
  return parsedValue ? [parsedValue] : [];
}

export function toDateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : new Date(timestamp);
  }

  return null;
}

export function toAllowedPageSize(value: unknown): number {
  const pageSize = toPositiveInteger(value);
  if (!pageSize) {
    return DEFAULT_PAGE_SIZE;
  }

  return PAGE_SIZE_OPTIONS.includes(pageSize as (typeof PAGE_SIZE_OPTIONS)[number])
    ? pageSize
    : DEFAULT_PAGE_SIZE;
}

export function toAmountFilterValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

export function toSettledFilterValue(value: unknown): boolean | null {
  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return null;
}
