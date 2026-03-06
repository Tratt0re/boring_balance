import type { TranslateService } from '@ngx-translate/core';

import type { EditableOptionItem } from '@/components/data-table';
import type { ZardComboboxOption } from '@/shared/components/combobox';

/**
 * Parses a value as a positive integer. Returns null if invalid.
 */
export function toPositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

/**
 * Trims and normalizes a value to a non-empty string, or null if blank/absent.
 */
export function normalizeNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = `${value}`.trim();
  return text.length > 0 ? text : null;
}

/**
 * Alias for normalizeNullableString — semantically signals the field is required,
 * returning null when the value is missing or blank (caller must treat null as invalid).
 */
export function normalizeRequiredString(value: unknown): string | null {
  return normalizeNullableString(value);
}

/**
 * Converts a Date to a Unix millisecond timestamp. Returns null for invalid dates.
 */
export function dateToUnixMs(value: Date | null | undefined): number | null {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return null;
  }

  return value.getTime();
}

/**
 * Maps EditableOptionItem[] to ZardComboboxOption[], translating labels via TranslateService.
 */
export function editableOptionsToCombobox(
  options: readonly EditableOptionItem[] | undefined,
  translateService: TranslateService,
): readonly ZardComboboxOption[] {
  return (options ?? []).map((option) => ({
    value: `${option.value}`,
    label: translateService.instant(option.label),
    icon: option.icon,
  }));
}
