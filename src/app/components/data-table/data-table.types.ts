import type { ZardButtonTypeVariants } from '@/shared/components/button';
import type { ZardIcon } from '@/shared/components/icon';

export type TableCellType = 'string' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean';
export type TableActionColumnPosition = 'start' | 'end';
export type TableSortDirection = 'asc' | 'desc';
export type EditableCellType = 'input' | 'checkbox' | 'select' | 'switch' | 'date';
export type EditableInputType = 'text' | 'number' | 'email' | 'password' | 'search' | 'url';

export interface TableDataItem {}

export interface ColumnDataItem extends TableDataItem {
  readonly columnName: string;
  readonly columnKey: string;
  readonly type?: TableCellType;
  readonly sortable?: boolean;
  readonly translate?: boolean;
}

export interface EditableOptionItem {
  readonly label: string;
  readonly value: string | number | boolean;
  readonly translate?: boolean;
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
}

export interface ActionDataItem extends TableDataItem {
  readonly actionItems: readonly ActionItem[];
}

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
