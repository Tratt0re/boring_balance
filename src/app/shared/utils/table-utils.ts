import type { ActionDataItem, ActionItem, EditableOptionItem } from '@/components/data-table';

/**
 * Converts a nullable icon string to an EditableOptionItem icon type.
 * Used when mapping model/API data to table option items.
 */
export function toEditableOptionIcon(value: string | null | undefined): EditableOptionItem['icon'] {
  return value ? (value as EditableOptionItem['icon']) : undefined;
}

/**
 * Creates a standard action column definition for data tables.
 * All action columns share the same minWidth/maxWidth and showLabel: false.
 */
export function createActionColumn(width: string, actions: readonly ActionItem[]): ActionDataItem {
  return {
    minWidth: width,
    maxWidth: width,
    showLabel: false,
    actionItems: actions,
  };
}
