import type { ZardBadgeShapeVariants, ZardBadgeTypeVariants } from '@/shared/components/badge';
import type { ZardButtonTypeVariants } from '@/shared/components/button';
import type { ZardIcon } from '@/shared/components/icon';

export type TableCellType = 'string' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean' | 'badge';
export type TableActionColumnPosition = 'start' | 'end';
export type TableSortDirection = 'asc' | 'desc';
export type EditableCellType = 'input' | 'checkbox' | 'select' | 'combobox' | 'switch' | 'date';
export type EditableInputType = 'text' | 'number' | 'email' | 'password' | 'search' | 'url';
export type TableWidthValue = string | number;
export type TableCurrencyIconMode = 'currency-trend' | 'transfer' | 'none';

export interface TableDataStructureItem {
  readonly minWidth?: TableWidthValue;
  readonly maxWidth?: TableWidthValue;
  readonly showLabel?: boolean;
}

export interface TableBadgeConfig {
  readonly icon?: ZardIcon;
  readonly type?: ZardBadgeTypeVariants;
  readonly shape?: ZardBadgeShapeVariants;
  readonly iconColumnKey?: string;
  readonly colorHexColumnKey?: string;
  readonly fullWidth?: boolean;
}

export interface TableCellIconConfig {
  readonly icon?: ZardIcon;
  readonly iconColumnKey?: string;
  readonly colorHex?: string;
  readonly colorHexColumnKey?: string;
}

export interface TableCurrencyConfig {
  readonly modality?: TableCurrencyIconMode;
  readonly iconMode?: TableCurrencyIconMode;
}

export interface ColumnDataItem extends TableDataStructureItem {
  readonly columnName: string;
  readonly columnKey: string;
  readonly type?: TableCellType;
  readonly sortable?: boolean;
  readonly translate?: boolean;
  readonly currency?: TableCurrencyConfig;
  readonly badge?: TableBadgeConfig;
  readonly cellIcon?: TableCellIconConfig;
}

export interface EditableOptionItem {
  readonly label: string;
  readonly value: string | number | boolean;
  readonly translate?: boolean;
  readonly icon?: ZardIcon;
  readonly colorHex?: string;
}

export interface EditableValidationRules {
  readonly required?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly validator?: (value: unknown, row: object) => string | null;
}

export interface EditableColumnDataItem extends ColumnDataItem {
  readonly editableType: EditableCellType;
  readonly inputType?: EditableInputType;
  readonly placeholder?: string;
  readonly options?: readonly EditableOptionItem[];
  readonly showOptionLabel?: boolean;
  readonly disabled?: boolean | ((row: object) => boolean);
  readonly validation?: EditableValidationRules;
}

export interface ActionItem {
  readonly id: string;
  readonly icon: ZardIcon;
  readonly label: string;
  readonly action: (row: object) => void | Promise<void>;
  readonly buttonType?: ZardButtonTypeVariants;
  readonly disabled?: (row: object) => boolean;
  readonly visible?: (row: object) => boolean;
  readonly showWhenDisabled?: boolean;
}

export interface TableHeaderActionItem {
  readonly id: string;
  readonly label: string;
  readonly action: () => void | Promise<void>;
  readonly icon?: ZardIcon;
  readonly showLabel?: boolean;
  readonly buttonType?: ZardButtonTypeVariants;
  readonly disabled?: boolean | (() => boolean);
}

export interface ActionDataItem extends TableDataStructureItem {
  readonly actionItems: readonly ActionItem[];
}

export type TableDataItem = ColumnDataItem | EditableColumnDataItem | ActionDataItem;
export type TableDataStructure = TableDataItem;

export interface TableSortState {
  readonly columnKey: string;
  readonly direction: TableSortDirection;
}

export interface EditableValueChangeEvent {
  readonly row: object;
  readonly columnKey: string;
  readonly value: unknown;
  readonly valid: boolean;
  readonly error: string | null;
}

export interface EditableValidationErrorEvent {
  readonly row: object;
  readonly columnKey: string;
  readonly value: unknown;
  readonly error: string;
}
