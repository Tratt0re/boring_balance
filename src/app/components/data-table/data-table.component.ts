import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import type { ClassValue } from 'clsx';

import { LocalPreferencesService } from '@/services/local-preferences.service';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardIconComponent } from '@/shared/components/icon';
import { ZardTableImports } from '@/shared/components/table';
import { mergeClasses } from '@/shared/utils/merge-classes';

import type {
  ActionItem,
  RowDataItem,
  TableActionColumnPosition,
  TableCellType,
  TableDataStructure,
  TableSortDirection,
  TableSortState,
} from './data-table.types';

type TableRow = object;
type TableRowRecord = Record<string, unknown>;

@Component({
  selector: 'app-data-table',
  imports: [TranslatePipe, ZardButtonComponent, ZardIconComponent, ...ZardTableImports],
  templateUrl: './data-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'appDataTable',
})
export class AppDataTableComponent {
  private readonly localPreferencesService = inject(LocalPreferencesService);
  private readonly translateService = inject(TranslateService);

  readonly data = input<readonly TableRow[]>([]);
  readonly structure = input.required<readonly TableDataStructure[]>();

  readonly title = input('');
  readonly description = input('');
  readonly emptyMessage = input('No data available.');
  readonly actionColumnName = input('Actions');
  readonly currencyCode = input('');
  readonly class = input<ClassValue>('');

  readonly showEmpty = input(true, { transform: booleanAttribute });
  readonly bordered = input(false, { transform: booleanAttribute });
  readonly striped = input(false, { transform: booleanAttribute });
  readonly hoverable = input(true, { transform: booleanAttribute });
  readonly selectable = input(false, { transform: booleanAttribute });
  readonly hasActionColumn = input(false, { transform: booleanAttribute });
  readonly actionColumnPosition = input<TableActionColumnPosition>('end');

  readonly selectedRowsChange = output<readonly TableRow[]>();
  readonly sortChange = output<TableSortState | null>();

  private readonly sortState = signal<TableSortState | null>(null);
  private readonly selectedRowsState = signal<ReadonlySet<TableRow>>(new Set<TableRow>());

  protected readonly columns = computed(() =>
    this.structure()
      .map((item) => item.rowDataItem)
      .filter((item): item is RowDataItem => item !== undefined),
  );

  protected readonly actionItems = computed(() => {
    const items: ActionItem[] = [];

    for (const item of this.structure()) {
      if (!item.actionItems) {
        continue;
      }

      items.push(...item.actionItems);
    }

    return items;
  });

  protected readonly showActionColumn = computed(() => this.hasActionColumn() || this.actionItems().length > 0);
  protected readonly renderActionColumnAtStart = computed(
    () => this.showActionColumn() && this.actionColumnPosition() === 'start',
  );
  protected readonly renderActionColumnAtEnd = computed(
    () => this.showActionColumn() && this.actionColumnPosition() === 'end',
  );

  protected readonly visibleColumnCount = computed(() => {
    let count = this.columns().length;
    if (this.selectable()) {
      count += 1;
    }

    if (this.showActionColumn()) {
      count += 1;
    }

    return count;
  });

  protected readonly containerClasses = computed(() =>
    mergeClasses('overflow-x-auto rounded-md', this.bordered() ? 'border border-border' : ''),
  );

  protected readonly tableClasses = computed(() =>
    mergeClasses(
      this.class(),
      this.striped() ? '[&_tbody_tr:nth-child(odd)]:bg-muted/50' : '',
      this.hoverable() ? '' : '[&_tbody_tr:hover]:!bg-transparent',
    ),
  );

  protected readonly sortedRows = computed(() => {
    const rows = [...this.data()];
    const sort = this.sortState();

    if (!sort) {
      return rows;
    }

    const column = this.columns().find((item) => item.columnKey === sort.columnKey);
    if (!column) {
      return rows;
    }

    const directionFactor = sort.direction === 'asc' ? 1 : -1;
    rows.sort((leftRow, rightRow) => directionFactor * this.compareRows(leftRow, rightRow, column));

    return rows;
  });

  protected readonly allVisibleRowsSelected = computed(() => {
    const rows = this.sortedRows();
    if (rows.length === 0) {
      return false;
    }

    const selectedRows = this.selectedRowsState();
    return rows.every((row) => selectedRows.has(row));
  });

  protected readonly partiallySelectedVisibleRows = computed(() => {
    const rows = this.sortedRows();
    if (rows.length === 0) {
      return false;
    }

    const selectedRows = this.selectedRowsState();
    const selectedInViewCount = rows.filter((row) => selectedRows.has(row)).length;

    return selectedInViewCount > 0 && selectedInViewCount < rows.length;
  });

  constructor() {
    effect(() => {
      const rows = this.sortedRows();
      const selectedRows = this.selectedRowsState();
      const nextSelection = new Set<TableRow>();

      for (const row of rows) {
        if (selectedRows.has(row)) {
          nextSelection.add(row);
        }
      }

      if (this.hasSelectionChanged(selectedRows, nextSelection)) {
        this.updateSelection(nextSelection);
      }
    });
  }

  protected onSortColumn(column: RowDataItem): void {
    if (!column.sortable) {
      return;
    }

    const currentSort = this.sortState();

    if (!currentSort || currentSort.columnKey !== column.columnKey) {
      const nextSort: TableSortState = { columnKey: column.columnKey, direction: 'asc' };
      this.sortState.set(nextSort);
      this.sortChange.emit(nextSort);
      return;
    }

    if (currentSort.direction === 'asc') {
      const nextSort: TableSortState = { columnKey: column.columnKey, direction: 'desc' };
      this.sortState.set(nextSort);
      this.sortChange.emit(nextSort);
      return;
    }

    this.sortState.set(null);
    this.sortChange.emit(null);
  }

  protected sortIcon(column: RowDataItem): 'chevrons-up-down' | 'chevron-up' | 'chevron-down' {
    if (!column.sortable) {
      return 'chevrons-up-down';
    }

    const direction = this.sortDirectionForColumn(column);
    if (direction === 'asc') {
      return 'chevron-up';
    }

    if (direction === 'desc') {
      return 'chevron-down';
    }

    return 'chevrons-up-down';
  }

  protected onToggleAllRows(event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
    const nextSelection = checked ? new Set<TableRow>(this.sortedRows()) : new Set<TableRow>();
    this.updateSelection(nextSelection);
  }

  protected onToggleRow(event: Event, row: TableRow): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
    const nextSelection = new Set<TableRow>(this.selectedRowsState());

    if (checked) {
      nextSelection.add(row);
    } else {
      nextSelection.delete(row);
    }

    this.updateSelection(nextSelection);
  }

  protected isRowSelected(row: TableRow): boolean {
    return this.selectedRowsState().has(row);
  }

  protected isActionDisabled(actionItem: ActionItem, row: TableRow): boolean {
    return actionItem.disabled?.(row) ?? false;
  }

  protected onActionClick(actionItem: ActionItem, row: TableRow): void {
    if (this.isActionDisabled(actionItem, row)) {
      return;
    }

    try {
      const result = actionItem.action(row);
      if (this.isPromiseLike(result)) {
        void result.catch((error) => {
          console.error('[app-data-table] Action failed:', error);
        });
      }
    } catch (error) {
      console.error('[app-data-table] Action failed:', error);
    }
  }

  protected formatCellValue(row: TableRow, column: RowDataItem): string {
    const rawValue = this.getRawValue(row, column.columnKey);
    const translatedValue =
      column.translate && typeof rawValue === 'string' ? this.translateService.instant(rawValue) : rawValue;

    return this.formatValueByType(translatedValue, column.type ?? 'string');
  }

  private sortDirectionForColumn(column: RowDataItem): TableSortDirection | null {
    const currentSort = this.sortState();

    if (!currentSort || currentSort.columnKey !== column.columnKey) {
      return null;
    }

    return currentSort.direction;
  }

  private compareRows(leftRow: TableRow, rightRow: TableRow, column: RowDataItem): number {
    const leftRaw = this.getRawValue(leftRow, column.columnKey);
    const rightRaw = this.getRawValue(rightRow, column.columnKey);

    const leftValue = column.translate && typeof leftRaw === 'string' ? this.translateService.instant(leftRaw) : leftRaw;
    const rightValue =
      column.translate && typeof rightRaw === 'string' ? this.translateService.instant(rightRaw) : rightRaw;

    return this.compareValues(leftValue, rightValue, column.type ?? 'string');
  }

  private compareValues(leftValue: unknown, rightValue: unknown, type: TableCellType): number {
    const leftEmpty = this.isEmptyValue(leftValue);
    const rightEmpty = this.isEmptyValue(rightValue);

    if (leftEmpty && rightEmpty) {
      return 0;
    }

    if (leftEmpty) {
      return 1;
    }

    if (rightEmpty) {
      return -1;
    }

    switch (type) {
      case 'number':
      case 'currency': {
        return this.compareNumberValues(leftValue, rightValue);
      }

      case 'date':
      case 'datetime': {
        return this.compareDateValues(leftValue, rightValue);
      }

      case 'boolean': {
        return this.compareBooleanValues(leftValue, rightValue);
      }

      case 'string':
      default: {
        const locale = this.resolveLocale();
        return this.toComparableString(leftValue).localeCompare(this.toComparableString(rightValue), locale, {
          numeric: true,
          sensitivity: 'base',
        });
      }
    }
  }

  private compareNumberValues(leftValue: unknown, rightValue: unknown): number {
    const leftNumber = this.toNumberValue(leftValue);
    const rightNumber = this.toNumberValue(rightValue);

    if (leftNumber === null && rightNumber === null) {
      return 0;
    }

    if (leftNumber === null) {
      return 1;
    }

    if (rightNumber === null) {
      return -1;
    }

    return leftNumber - rightNumber;
  }

  private compareDateValues(leftValue: unknown, rightValue: unknown): number {
    const leftDate = this.toDateValue(leftValue);
    const rightDate = this.toDateValue(rightValue);

    if (leftDate === null && rightDate === null) {
      return 0;
    }

    if (leftDate === null) {
      return 1;
    }

    if (rightDate === null) {
      return -1;
    }

    return leftDate.getTime() - rightDate.getTime();
  }

  private compareBooleanValues(leftValue: unknown, rightValue: unknown): number {
    const leftBoolean = this.toBooleanValue(leftValue);
    const rightBoolean = this.toBooleanValue(rightValue);

    if (leftBoolean === null && rightBoolean === null) {
      return 0;
    }

    if (leftBoolean === null) {
      return 1;
    }

    if (rightBoolean === null) {
      return -1;
    }

    return Number(leftBoolean) - Number(rightBoolean);
  }

  private formatValueByType(value: unknown, type: TableCellType): string {
    if (this.isEmptyValue(value)) {
      return '-';
    }

    switch (type) {
      case 'number': {
        const numericValue = this.toNumberValue(value);
        if (numericValue === null) {
          return '-';
        }

        return new Intl.NumberFormat(this.resolveLocale()).format(numericValue);
      }

      case 'currency': {
        const numericValue = this.toNumberValue(value);
        if (numericValue === null) {
          return '-';
        }

        const currency = this.resolveCurrencyCode();

        try {
          return new Intl.NumberFormat(this.resolveLocale(), {
            style: 'currency',
            currency,
          }).format(numericValue);
        } catch {
          return `${numericValue}`;
        }
      }

      case 'date': {
        const dateValue = this.toDateValue(value);
        if (!dateValue) {
          return '-';
        }

        return new Intl.DateTimeFormat(this.resolveLocale(), {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
        }).format(dateValue);
      }

      case 'datetime': {
        const dateValue = this.toDateValue(value);
        if (!dateValue) {
          return '-';
        }

        return new Intl.DateTimeFormat(this.resolveLocale(), {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(dateValue);
      }

      case 'boolean': {
        const booleanValue = this.toBooleanValue(value);
        if (booleanValue === null) {
          return '-';
        }

        return booleanValue ? 'Yes' : 'No';
      }

      case 'string':
      default:
        return this.toComparableString(value);
    }
  }

  private getRawValue(row: TableRow, columnKey: string): unknown {
    return (row as TableRowRecord)[columnKey];
  }

  private resolveCurrencyCode(): string {
    const explicitCurrencyCode = this.currencyCode().trim();
    if (explicitCurrencyCode.length > 0) {
      return explicitCurrencyCode.toUpperCase();
    }

    return this.localPreferencesService.getCurrency().toUpperCase();
  }

  private resolveLocale(): string | undefined {
    const currentLanguage = this.translateService.currentLang?.trim();
    return currentLanguage && currentLanguage.length > 0 ? currentLanguage : undefined;
  }

  private toComparableString(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    return String(value);
  }

  private toNumberValue(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsedValue = Number(value);
      return Number.isFinite(parsedValue) ? parsedValue : null;
    }

    return null;
  }

  private toDateValue(value: unknown): Date | null {
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

  private toBooleanValue(value: unknown): boolean | null {
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

  private isEmptyValue(value: unknown): boolean {
    return value === null || value === undefined || value === '';
  }

  private hasSelectionChanged(previous: ReadonlySet<TableRow>, next: ReadonlySet<TableRow>): boolean {
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

  private updateSelection(nextSelection: ReadonlySet<TableRow>): void {
    this.selectedRowsState.set(nextSelection);
    this.selectedRowsChange.emit(Array.from(nextSelection));
  }

  private isPromiseLike(value: unknown): value is Promise<unknown> {
    return typeof value === 'object' && value !== null && 'then' in value;
  }
}
