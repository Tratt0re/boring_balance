import type { TableDataItem } from '@/components/data-table';
import { DEFAULT_VISUAL_ICON_KEY } from '@/config/visual-options.config';
import { createActionColumn } from '@/shared/utils';

export type BudgetSectionView = 'setup' | 'analysis';

export interface BudgetCategoryLookup {
  readonly name: string;
  readonly icon: string | null;
  readonly colorKey: string | null;
}

export interface BudgetTableRow {
  readonly id: number;
  readonly categoryId: number;
  readonly categoryName: string;
  readonly categoryIcon: string | null;
  readonly categoryColorHex: string;
  readonly budgetYear: number;
  readonly amount: number;
  readonly description: string | null;
}

export const BUDGET_COLUMN_WIDTH = {
  category: '3/10',
  year: '1/10',
  amount: '2/10',
  description: '3/10',
  action: '1/10',
} as const;

export const BUDGET_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'common.labels.year',
    columnKey: 'budgetYear',
    type: 'number',
    number: {
      useGrouping: false,
    },
    sortable: true,
    minWidth: BUDGET_COLUMN_WIDTH.year,
    maxWidth: BUDGET_COLUMN_WIDTH.year,
  },
  {
    columnName: 'common.labels.category',
    columnKey: 'categoryName',
    type: 'badge',
    sortable: true,
    minWidth: BUDGET_COLUMN_WIDTH.category,
    maxWidth: BUDGET_COLUMN_WIDTH.category,
    badge: {
      type: 'secondary',
      shape: 'pill',
      icon: DEFAULT_VISUAL_ICON_KEY,
      iconColumnKey: 'categoryIcon',
      colorHexColumnKey: 'categoryColorHex',
      colorMode: 'icon',
      fullWidth: true,
    },
  },
  {
    columnName: 'common.labels.description',
    columnKey: 'description',
    type: 'string',
    sortable: true,
    minWidth: BUDGET_COLUMN_WIDTH.description,
    maxWidth: BUDGET_COLUMN_WIDTH.description,
  },
  {
    columnName: 'common.labels.amount',
    columnKey: 'amount',
    type: 'currency',
    sortable: true,
    minWidth: BUDGET_COLUMN_WIDTH.amount,
    maxWidth: BUDGET_COLUMN_WIDTH.amount,
  },
] as const;

export const createBudgetTableStructure = (
  onEditAction: (row: object) => void | Promise<void>,
  onDeleteAction: (row: object) => void | Promise<void>,
): readonly TableDataItem[] =>
  [
    ...BUDGET_TABLE_COLUMNS,
    createActionColumn(BUDGET_COLUMN_WIDTH.action, [
      {
        id: 'edit',
        icon: 'pencil',
        label: 'budgets.table.actions.edit',
        buttonType: 'ghost',
        action: onEditAction,
      },
      {
        id: 'delete',
        icon: 'trash',
        label: 'budgets.table.actions.delete',
        buttonType: 'ghost',
        action: onDeleteAction,
      },
    ]),
  ] as const;

export const MIN_YEAR = 1970;
export const MAX_YEAR = 9999;
export const AMOUNT_CENTS_DIVISOR = 100;
export const ANALYSIS_CHART_MIN_HEIGHT_REM = 18;
export const ANALYSIS_CHART_BASE_HEIGHT_REM = 6;
export const ANALYSIS_CHART_ROW_HEIGHT_REM = 2.25;

export interface BudgetAnalysisTotals {
  readonly budget_amount_cents: number;
  readonly expenses_total_cents: number;
  readonly delta_cents: number;
}
