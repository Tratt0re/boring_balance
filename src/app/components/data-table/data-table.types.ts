import type { ZardButtonTypeVariants } from '@/shared/components/button';
import type { ZardIcon } from '@/shared/components/icon';

export type TableCellType = 'string' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean';
export type TableActionColumnPosition = 'start' | 'end';
export type TableSortDirection = 'asc' | 'desc';

export interface RowDataItem {
  readonly columnName: string;
  readonly columnKey: string;
  readonly type?: TableCellType;
  readonly sortable?: boolean;
  readonly translate?: boolean;
}

export interface ActionItem {
  readonly id: string;
  readonly icon: ZardIcon;
  readonly label: string;
  readonly action: (row: object) => void | Promise<void>;
  readonly buttonType?: ZardButtonTypeVariants;
  readonly disabled?: (row: object) => boolean;
}

export interface TableDataStructure {
  readonly rowDataItem?: RowDataItem;
  readonly actionItems?: readonly ActionItem[];
}

export interface TableSortState {
  readonly columnKey: string;
  readonly direction: TableSortDirection;
}
