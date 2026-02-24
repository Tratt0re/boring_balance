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
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import type { ClassValue } from 'clsx';

import { AppPaginationComponent } from '@/components/pagination/pagination.component';
import { APP_ICON_OPTIONS } from '@/config/visual-options.config';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCheckboxComponent } from '@/shared/components/checkbox';
import { ZardComboboxComponent, type ZardComboboxOption } from '@/shared/components/combobox';
import { ZardDatePickerComponent } from '@/shared/components/date-picker';
import { ZardIconComponent, ZARD_ICONS, type ZardIcon } from '@/shared/components/icon';
import { ZardInputDirective } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSwitchComponent } from '@/shared/components/switch';
import { ZardTableImports } from '@/shared/components/table';
import { ZardTooltipImports } from '@/shared/components/tooltip';
import { mergeClasses } from '@/shared/utils/merge-classes';

import type {
  ActionDataItem,
  ActionItem,
  EditableColumnDataItem,
  EditableOptionItem,
  EditableValueChangeEvent,
  EditableValidationErrorEvent,
  ColumnDataItem,
  TableActiveFilterItem,
  TableHeaderActionItem,
  TableActionColumnPosition,
  TableCellType,
  TableDataItem,
  TableCurrencyIconMode,
  TableSortDirection,
  TableSortState,
  TableWidthValue,
} from './data-table.types';

type TableRow = object;
type TableRowRecord = Record<string, unknown>;
type TableColumn = ColumnDataItem;
type EditableValueMap = Map<TableRow, Map<string, unknown>>;
type EditableErrorMap = Map<TableRow, Map<string, string>>;
type RowClassResolver = (row: TableRow) => ClassValue | null | undefined;
type CurrencyCellIcon = {
  readonly icon: ZardIcon;
  readonly color: string;
};
const APP_ICON_BY_VALUE = new Map(APP_ICON_OPTIONS.map((option) => [option.value, option.icon ?? null] as const));

@Component({
  selector: 'app-data-table',
  imports: [
    NgTemplateOutlet,
    TranslatePipe,
    AppPaginationComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardComboboxComponent,
    ZardDatePickerComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardSwitchComponent,
    ...ZardTooltipImports,
    ...ZardSelectImports,
    ...ZardTableImports,
  ],
  templateUrl: './data-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'appDataTable',
})
export class AppDataTableComponent {
  private readonly localPreferencesService = inject(LocalPreferencesService);
  private readonly translateService = inject(TranslateService);
  private readonly rowTrackKeyByIdentity = new WeakMap<TableRow, number>();
  private nextRowTrackKey = 1;

  readonly data = input<readonly TableRow[]>([]);
  readonly structure = input.required<readonly TableDataItem[]>();

  readonly title = input('');
  readonly description = input('');
  readonly tableActions = input<readonly TableHeaderActionItem[]>([]);
  readonly activeFilters = input<readonly TableActiveFilterItem[]>([], { alias: 'active-filters' });
  readonly emptyMessage = input('No data available.');
  readonly actionColumnName = input('common.actions');
  readonly currencyCode = input('');
  readonly editablePickerIconClass = input<ClassValue>('text-primary opacity-70');
  readonly rowClass = input<RowClassResolver | null>(null);
  readonly class = input<ClassValue>('');

  readonly minHeight = input<TableWidthValue | null>(null);
  readonly maxHeight = input<TableWidthValue | null>(null);
  readonly showEmpty = input(true, { transform: booleanAttribute });
  readonly bordered = input(false, { transform: booleanAttribute });
  readonly striped = input(false, { transform: booleanAttribute });
  readonly hoverable = input(true, { transform: booleanAttribute });
  readonly selectable = input(false, { transform: booleanAttribute });
  readonly stickyHeader = input(false, { transform: booleanAttribute });
  readonly highContrastHeader = input(false, { transform: booleanAttribute });
  readonly hasActionColumn = input(false, { transform: booleanAttribute });
  readonly actionColumnPosition = input<TableActionColumnPosition>('end');
  readonly showPagination = input(false, { transform: booleanAttribute });
  readonly currentPage = input(1);
  readonly totalPages = input(1);
  readonly pageSize = input(10);
  readonly pageSizeOptions = input<readonly number[]>([5, 10, 25, 50]);
  readonly maxVisiblePages = input(5);
  readonly pageSizeLabel = input('Rows per page');
  readonly showPageSizeSelector = input(false, { transform: booleanAttribute });
  readonly showTopPagination = input(false, { transform: booleanAttribute });

  readonly selectedRowsChange = output<readonly TableRow[]>();
  readonly sortChange = output<TableSortState | null>();
  readonly editableValueChange = output<EditableValueChangeEvent>();
  readonly editableValidationError = output<EditableValidationErrorEvent>();
  readonly activeFilterRemove = output<TableActiveFilterItem>();
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  private readonly sortState = signal<TableSortState | null>(null);
  private readonly selectedRowsState = signal<ReadonlySet<TableRow>>(new Set<TableRow>());
  private readonly editableValuesState = signal<EditableValueMap>(new Map());
  private readonly editableErrorsState = signal<EditableErrorMap>(new Map());

  protected readonly columns = computed<TableColumn[]>(() => {
    const columns: TableColumn[] = [];

    for (const item of this.structure()) {
      if (this.isColumnDataItem(item)) {
        columns.push(item);
      }
    }

    return columns;
  });

  protected readonly actionItems = computed(() => {
    const items: ActionItem[] = [];

    for (const item of this.structure()) {
      if (!this.isActionDataItem(item)) {
        continue;
      }

      items.push(...item.actionItems);
    }

    return items;
  });

  protected readonly actionColumn = computed<ActionDataItem | null>(() => {
    for (const item of this.structure()) {
      if (this.isActionDataItem(item)) {
        return item;
      }
    }

    return null;
  });

  protected readonly visibleTableActions = computed(() =>
    this.tableActions().filter((actionItem) => !this.isTableActionDisabled(actionItem)),
  );
  protected readonly visibleActiveFilters = computed(() =>
    this.activeFilters().filter((activeFilter) => activeFilter.label.trim().length > 0),
  );

  protected readonly hasAnyVisibleRowAction = computed(() => {
    const actionItems = this.actionItems();
    if (actionItems.length === 0) {
      return false;
    }

    for (const row of this.sortedRows()) {
      for (const actionItem of actionItems) {
        if (this.shouldRenderAction(actionItem, row)) {
          return true;
        }
      }
    }

    return false;
  });

  protected readonly showActionColumn = computed(() => this.hasActionColumn() || this.hasAnyVisibleRowAction());
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

  protected readonly hasColumnWidthConstraints = computed(() =>
    this.columns().some((column) => column.minWidth !== undefined || column.maxWidth !== undefined) ||
    this.hasActionColumnWidthConstraints(),
  );

  protected readonly hasActionColumnWidthConstraints = computed(() => {
    const actionColumn = this.actionColumn();
    return actionColumn !== null && (actionColumn.minWidth !== undefined || actionColumn.maxWidth !== undefined);
  });

  protected readonly containerClasses = computed(() =>
    mergeClasses(
      'rounded-md bg-background',
      'min-h-[var(--app-data-table-min-h)] max-h-[var(--app-data-table-max-h)]',
      this.stickyHeader() ? 'overflow-visible' : 'overflow-x-auto',
      this.bordered() ? 'ring-1 ring-border' : '',
    ),
  );

  protected readonly tableClasses = computed(() =>
    mergeClasses(
      this.class(),
      this.hasColumnWidthConstraints() ? 'table-fixed' : 'table-auto',
      this.stickyHeader() ? 'border-separate border-spacing-0' : '',
      this.highContrastHeader() ? '[&_th]:text-high-contrast-table-header-foreground' : '',
      this.striped() ? '[&_tbody_tr:nth-child(odd)]:bg-muted/50' : '',
      this.hoverable() ? '' : '[&_tbody_tr:hover]:!bg-transparent',
    ),
  );
  protected readonly headerBackgroundClass = computed(() =>
    this.highContrastHeader()
      ? 'bg-high-contrast-table-header text-high-contrast-table-header-foreground'
      : this.stickyHeader()
        ? 'bg-background'
        : '',
  );
  protected readonly headerBorderClass = computed(() =>
    this.highContrastHeader()
      ? 'border-b-high-contrast-table-header'
      : this.stickyHeader()
        ? 'border-b-border'
        : '',
  );
  protected readonly sortableHeaderButtonClasses = computed(() =>
    mergeClasses(
      'h-auto px-0 py-0 text-left hover:bg-transparent',
      this.highContrastHeader()
        ? 'text-high-contrast-table-header-foreground hover:text-high-contrast-table-header-foreground'
        : 'hover:text-foreground',
    ),
  );
  protected readonly stickyHeaderCellClasses = computed(() =>
    mergeClasses(
      this.stickyHeader()
        ? 'relative sticky -top-[24px] z-30 h-[40px] min-h-[40px] border-b first:rounded-tl-md last:rounded-tr-md'
        : '',
      this.headerBackgroundClass(),
      this.headerBorderClass(),
    ),
  );
  protected readonly stickyHeaderCheckboxCellClasses = computed(() =>
    mergeClasses('w-10', this.stickyHeaderCellClasses()),
  );
  protected readonly stickyHeaderActionCellClasses = computed(() =>
    mergeClasses(this.actionColumnWidthClass(), this.stickyHeaderCellClasses()),
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

  protected onSortColumn(column: TableColumn): void {
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

  protected onPageChange(page: number): void {
    this.pageChange.emit(page);
  }

  protected onPageSizeChange(pageSize: number): void {
    this.pageSizeChange.emit(pageSize);
  }

  protected sortIcon(column: TableColumn): 'chevrons-up-down' | 'chevron-up' | 'chevron-down' {
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

  protected onToggleAllRowsChange(checked: boolean): void {
    const nextSelection = checked ? new Set<TableRow>(this.sortedRows()) : new Set<TableRow>();
    this.updateSelection(nextSelection);
  }

  protected rowTrackKey(index: number, row: TableRow): string {
    void index;

    const rowRecord = row as TableRowRecord;
    const rowId = rowRecord['id'];
    if (typeof rowId === 'string' || typeof rowId === 'number' || typeof rowId === 'bigint') {
      return `id:${rowId}`;
    }

    const keyByIdentity = this.rowTrackKeyByIdentity.get(row);
    if (keyByIdentity !== undefined) {
      return `obj:${keyByIdentity}`;
    }

    const nextKey = this.nextRowTrackKey++;
    this.rowTrackKeyByIdentity.set(row, nextKey);
    return `obj:${nextKey}`;
  }

  protected rowClassName(row: TableRow): ClassValue {
    return this.rowClass()?.(row) ?? '';
  }

  protected onToggleRowChange(checked: boolean, row: TableRow): void {
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

  protected isActionVisible(actionItem: ActionItem, row: TableRow): boolean {
    return actionItem.visible?.(row) ?? true;
  }

  protected isTableActionDisabled(actionItem: TableHeaderActionItem): boolean {
    if (typeof actionItem.disabled === 'function') {
      return actionItem.disabled();
    }

    return actionItem.disabled ?? false;
  }

  protected showTableActionLabel(actionItem: TableHeaderActionItem): boolean {
    if (!actionItem.icon) {
      return true;
    }

    return actionItem.showLabel ?? true;
  }

  protected activeFilterLabel(activeFilter: TableActiveFilterItem): string {
    if (activeFilter.translate === false) {
      return activeFilter.label;
    }

    return this.translateString(activeFilter.label);
  }

  protected activeFilterRemoveLabel(activeFilter: TableActiveFilterItem): string {
    return `Remove filter: ${this.activeFilterLabel(activeFilter)}`;
  }

  protected isActiveFilterRemovable(activeFilter: TableActiveFilterItem): boolean {
    return activeFilter.removable ?? true;
  }

  protected onActiveFilterRemove(event: Event, activeFilter: TableActiveFilterItem): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.isActiveFilterRemovable(activeFilter)) {
      return;
    }

    this.activeFilterRemove.emit(activeFilter);
  }

  protected visibleRowActionItems(row: TableRow): readonly ActionItem[] {
    return this.actionItems().filter((actionItem) => this.shouldRenderAction(actionItem, row));
  }

  protected onTableActionClick(actionItem: TableHeaderActionItem): void {
    if (this.isTableActionDisabled(actionItem)) {
      return;
    }

    try {
      const result = actionItem.action();
      if (this.isPromiseLike(result)) {
        void result.catch((error) => {
          console.error('[app-data-table] Table action failed:', error);
        });
      }
    } catch (error) {
      console.error('[app-data-table] Table action failed:', error);
    }
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

  protected isEditableColumn(column: TableColumn): column is EditableColumnDataItem {
    return 'editableType' in column;
  }

  protected isEditableDisabled(column: EditableColumnDataItem, row: TableRow): boolean {
    if (typeof column.disabled === 'function') {
      return column.disabled(row);
    }

    return column.disabled ?? false;
  }

  protected getEditableInputType(column: EditableColumnDataItem): string {
    if (column.inputType) {
      return column.inputType;
    }

    if (column.type === 'number' || column.type === 'currency') {
      return 'number';
    }

    return 'text';
  }

  protected getEditableInputValue(row: TableRow, column: EditableColumnDataItem): string {
    const value = this.getEditableValue(row, column);
    return value === null || value === undefined ? '' : `${value}`;
  }

  protected getEditableChecked(row: TableRow, column: EditableColumnDataItem): boolean {
    return this.toBooleanValue(this.getEditableValue(row, column)) ?? false;
  }

  protected getEditableSelectValue(row: TableRow, column: EditableColumnDataItem): string {
    const value = this.getEditableValue(row, column);
    return value === null || value === undefined ? '' : `${value}`;
  }

  protected getEditableComboboxValue(row: TableRow, column: EditableColumnDataItem): string | null {
    const value = this.getEditableValue(row, column);
    if (value === null || value === undefined) {
      return null;
    }

    const normalizedValue = `${value}`;
    return normalizedValue.length > 0 ? normalizedValue : null;
  }

  protected getEditableDateValue(row: TableRow, column: EditableColumnDataItem): Date | null {
    return this.toDateValue(this.getEditableValue(row, column));
  }

  protected stringifyOptionValue(value: string | number | boolean): string {
    return `${value}`;
  }

  protected formatEditableReadonlyValue(row: TableRow, column: EditableColumnDataItem): string {
    return this.formatColumnValue(this.getEditableValue(row, column), column);
  }

  protected getEditableSelectOption(row: TableRow, column: EditableColumnDataItem): EditableOptionItem | null {
    const rawValue = this.getEditableValue(row, column);
    const normalizedValue = rawValue === null || rawValue === undefined ? '' : `${rawValue}`;

    return column.options?.find((option) => `${option.value}` === normalizedValue) ?? null;
  }

  protected getEditableComboboxOptions(column: EditableColumnDataItem): ZardComboboxOption[] {
    const options = column.options ?? [];
    return options.map((option) => ({
      value: this.stringifyOptionValue(option.value),
      label: this.getEditableOptionLabel(option),
      icon: option.icon,
    }));
  }

  protected getEditableOptionLabel(option: EditableOptionItem): string {
    return this.translateString(option.label);
  }

  protected getEditableSelectReadonlyValue(row: TableRow, column: EditableColumnDataItem): string {
    const value = this.getEditableValue(row, column);
    const selectedOption = this.getEditableSelectOption(row, column);

    if (!selectedOption) {
      return this.formatColumnValue(value, column);
    }

    return this.getEditableOptionLabel(selectedOption);
  }

  protected shouldShowEditableSelectLabel(column: EditableColumnDataItem): boolean {
    return column.showOptionLabel ?? true;
  }

  protected getEditableError(row: TableRow, column: EditableColumnDataItem): string | null {
    const errorByColumn = this.editableErrorsState().get(row);
    return errorByColumn?.get(column.columnKey) ?? null;
  }

  protected getVisibleEditableError(row: TableRow, column: EditableColumnDataItem): string | null {
    if (
      this.isEditableDisabled(column, row) &&
      (column.editableType === 'input' ||
        column.editableType === 'select' ||
        column.editableType === 'combobox' ||
        column.editableType === 'date')
    ) {
      return null;
    }

    return this.getEditableError(row, column);
  }

  protected onEditableTextInput(event: Event, row: TableRow, column: EditableColumnDataItem): void {
    const inputValue = (event.target as HTMLInputElement | null)?.value ?? '';
    const normalizedValue = this.normalizeInputValue(inputValue, column);
    const error = this.validateEditableValue(row, column, normalizedValue);
    this.setEditableError(row, column.columnKey, error);

    if (error) {
      this.editableValidationError.emit({
        row,
        columnKey: column.columnKey,
        value: normalizedValue,
        error,
      });
    }
  }

  protected onEditableTextBlur(event: FocusEvent, row: TableRow, column: EditableColumnDataItem): void {
    this.commitEditableTextValue(event.target, row, column);
  }

  protected onEditableTextEnter(event: Event, row: TableRow, column: EditableColumnDataItem): void {
    event.preventDefault();
    this.commitEditableTextValue(event.target, row, column);
    (event.target as HTMLInputElement | null)?.blur();
  }

  protected onEditableSelectValueChange(
    value: string | string[],
    row: TableRow,
    column: EditableColumnDataItem,
  ): void {
    if (Array.isArray(value)) {
      console.warn('[app-data-table] Select editor received multiple values, expected a single value.', value);
      return;
    }

    const normalizedValue = this.resolveSelectValue(value, column);
    this.applyEditableChange(row, column, normalizedValue);
  }

  protected onEditableComboboxValueChange(
    value: string | string[] | null,
    row: TableRow,
    column: EditableColumnDataItem,
  ): void {
    if (Array.isArray(value)) {
      console.warn('[app-data-table] Combobox editor received multiple values, expected a single value.', value);
      return;
    }

    const normalizedValue = this.resolveComboboxValue(value, column);
    this.applyEditableChange(row, column, normalizedValue);
  }

  protected onEditableSwitchChange(checked: boolean, row: TableRow, column: EditableColumnDataItem): void {
    this.applyEditableChange(row, column, checked);
  }

  protected onEditableCheckboxValueChange(checked: boolean, row: TableRow, column: EditableColumnDataItem): void {
    this.applyEditableChange(row, column, checked);
  }

  protected onEditableDateChange(value: Date | null, row: TableRow, column: EditableColumnDataItem): void {
    this.applyEditableChange(row, column, value);
  }

  protected formatCellValue(row: TableRow, column: ColumnDataItem): string {
    return this.formatColumnValue(this.getRawValue(row, column.columnKey), column);
  }

  protected currencyCellIcon(row: TableRow, column: ColumnDataItem): CurrencyCellIcon | null {
    if (column.type !== 'currency') {
      return null;
    }

    const iconMode = this.currencyIconMode(row, column);
    if (iconMode === 'none') {
      return null;
    }

    if (iconMode === 'transfer') {
      return { icon: 'arrow-right-left', color: 'var(--positive-transaction-color)' };
    }

    const numericValue = this.toNumberValue(this.getRawValue(row, column.columnKey));
    if (numericValue === null || numericValue === 0) {
      return null;
    }

    return numericValue > 0
      ? { icon: 'arrow-up', color: 'var(--positive-transaction-color)' }
      : { icon: 'arrow-down', color: 'var(--negative-transaction-color)' };
  }

  protected cellIcon(row: TableRow, column: ColumnDataItem): ZardIcon | null {
    const fallbackIcon = this.resolveTableIcon(column.cellIcon?.icon);
    const iconColumnKey = column.cellIcon?.iconColumnKey;
    if (iconColumnKey) {
      const icon = this.resolveTableIcon(this.getRawValue(row, iconColumnKey));
      if (icon) {
        return icon;
      }
    }

    return fallbackIcon;
  }

  protected cellIconColor(row: TableRow, column: ColumnDataItem): string | null {
    const colorColumnKey = column.cellIcon?.colorHexColumnKey;
    if (colorColumnKey) {
      const colorValue = this.getRawValue(row, colorColumnKey);
      if (typeof colorValue === 'string' && colorValue.trim().length > 0) {
        return colorValue;
      }
    }

    const fallbackColor = column.cellIcon?.colorHex;
    return typeof fallbackColor === 'string' && fallbackColor.trim().length > 0 ? fallbackColor : null;
  }

  protected columnMinWidth(column: TableColumn): string | null {
    return this.normalizeSizeValue(column.minWidth);
  }

  protected columnMaxWidth(column: TableColumn): string | null {
    return this.normalizeSizeValue(column.maxWidth);
  }

  protected columnWidth(column: TableColumn): string | null {
    const minWidth = this.columnMinWidth(column);
    const maxWidth = this.columnMaxWidth(column);

    if (minWidth && maxWidth && minWidth === maxWidth) {
      return minWidth;
    }

    // Fixed table layout prioritizes explicit width. If only one bound exists, use it as preferred width.
    return maxWidth ?? minWidth;
  }

  protected actionColumnMinWidth(): string | null {
    return this.normalizeSizeValue(this.actionColumn()?.minWidth);
  }

  protected actionColumnMaxWidth(): string | null {
    return this.normalizeSizeValue(this.actionColumn()?.maxWidth);
  }

  protected actionColumnWidth(): string | null {
    const minWidth = this.actionColumnMinWidth();
    const maxWidth = this.actionColumnMaxWidth();

    if (minWidth && maxWidth && minWidth === maxWidth) {
      return minWidth;
    }

    return maxWidth ?? minWidth;
  }

  protected actionColumnWidthClass(): string {
    return this.hasActionColumnWidthConstraints() ? '' : 'w-24';
  }

  protected showColumnLabel(column: TableColumn): boolean {
    return column.showLabel ?? true;
  }

  protected showActionColumnLabel(): boolean {
    const actionColumn = this.actionColumn();
    return actionColumn?.showLabel ?? true;
  }

  protected containerMinHeightValue(): string | null {
    return this.normalizeSizeValue(this.minHeight());
  }

  protected containerMaxHeightValue(): string | null {
    return this.normalizeSizeValue(this.maxHeight());
  }

  protected isBadgeColumn(column: ColumnDataItem): boolean {
    return column.type === 'badge';
  }

  protected badgeIcon(row: TableRow, column: ColumnDataItem): ZardIcon | null {
    if (!this.isBadgeColumn(column)) {
      return null;
    }

    const fallbackIcon = this.resolveTableIcon(column.badge?.icon);
    const iconColumnKey = column.badge?.iconColumnKey;
    if (iconColumnKey) {
      const icon = this.resolveTableIcon(this.getRawValue(row, iconColumnKey));
      if (icon) {
        return icon;
      }
    }

    return fallbackIcon;
  }

  protected badgeInlineStyle(row: TableRow, column: ColumnDataItem): string | null {
    if (!this.isBadgeColumn(column)) {
      return null;
    }

    const styles: string[] = [];
    if (column.badge?.fullWidth) {
      styles.push('display:flex;width:100%;');
    }

    const colorColumnKey = column.badge?.colorHexColumnKey;
    if (colorColumnKey) {
      const colorValue = this.getRawValue(row, colorColumnKey);
      if (typeof colorValue === 'string' && colorValue.trim().length > 0) {
        styles.push(`background-color:${colorValue};border-color:${colorValue};color:#fff;`);
      }
    }

    return styles.length > 0 ? styles.join('') : null;
  }

  private sortDirectionForColumn(column: TableColumn): TableSortDirection | null {
    const currentSort = this.sortState();

    if (!currentSort || currentSort.columnKey !== column.columnKey) {
      return null;
    }

    return currentSort.direction;
  }

  private compareRows(leftRow: TableRow, rightRow: TableRow, column: TableColumn): number {
    const leftRaw = this.getSortValue(leftRow, column);
    const rightRaw = this.getSortValue(rightRow, column);

    const leftValue = this.translateIfString(leftRaw);
    const rightValue = this.translateIfString(rightRaw);

    return this.compareValues(leftValue, rightValue, column.type ?? 'string');
  }

  private getSortValue(row: TableRow, column: TableColumn): unknown {
    if (this.isEditableColumn(column)) {
      return this.getEditableValue(row, column);
    }

    return this.getRawValue(row, column.columnKey);
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

  private resolveTableIcon(value: unknown): ZardIcon | null {
    if (!value) {
      return null;
    }

    if (typeof value !== 'string') {
      return value as ZardIcon;
    }

    const normalizedValue = value.trim();
    if (normalizedValue.length === 0) {
      return null;
    }

    const mappedIcon = APP_ICON_BY_VALUE.get(normalizedValue);
    if (mappedIcon) {
      return mappedIcon;
    }

    return this.isRegisteredIcon(normalizedValue) ? (normalizedValue as ZardIcon) : null;
  }

  private isRegisteredIcon(value: string): value is keyof typeof ZARD_ICONS {
    return Object.prototype.hasOwnProperty.call(ZARD_ICONS, value);
  }

  private shouldRenderAction(actionItem: ActionItem, row: TableRow): boolean {
    if (!this.isActionVisible(actionItem, row)) {
      return false;
    }

    if (!this.isActionDisabled(actionItem, row)) {
      return true;
    }

    return actionItem.showWhenDisabled ?? false;
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

        return this.translateString(booleanValue ? 'Yes' : 'No');
      }

      case 'string':
      default:
        return this.toComparableString(value);
    }
  }

  private isColumnDataItem(item: TableDataItem): item is ColumnDataItem {
    return 'columnName' in item && 'columnKey' in item;
  }

  private currencyIconMode(row: TableRow, column: ColumnDataItem): TableCurrencyIconMode {
    if (column.type !== 'currency') {
      return 'none';
    }

    const iconModeColumnKey = column.currency?.iconModeColumnKey;
    if (iconModeColumnKey) {
      const rowIconMode = this.toCurrencyIconMode(this.getRawValue(row, iconModeColumnKey));
      if (rowIconMode) {
        return rowIconMode;
      }
    }

    return this.toCurrencyIconMode(column.currency?.modality ?? column.currency?.iconMode) ?? 'none';
  }

  private toCurrencyIconMode(value: unknown): TableCurrencyIconMode | null {
    return value === 'currency-trend' || value === 'transfer' || value === 'none' ? value : null;
  }

  private formatColumnValue(value: unknown, column: ColumnDataItem): string {
    const translatedValue = this.translateIfString(value);
    return this.formatValueByType(translatedValue, column.type ?? 'string');
  }

  private isActionDataItem(item: TableDataItem): item is ActionDataItem {
    return 'actionItems' in item && Array.isArray(item.actionItems);
  }

  private commitEditableTextValue(
    target: EventTarget | null,
    row: TableRow,
    column: EditableColumnDataItem,
  ): void {
    const inputValue = (target as HTMLInputElement | null)?.value ?? '';
    const normalizedValue = this.normalizeInputValue(inputValue, column);
    this.applyEditableChange(row, column, normalizedValue);
  }

  private applyEditableChange(row: TableRow, column: EditableColumnDataItem, value: unknown): void {
    const previousValue = this.getEditableValue(row, column);
    const hasValueChanged = !this.areEditableValuesEqual(previousValue, value, column);
    const error = this.validateEditableValue(row, column, value);
    const previousError = this.getEditableError(row, column);

    if (previousError !== error) {
      this.setEditableError(row, column.columnKey, error);
    }

    if (!hasValueChanged) {
      return;
    }

    this.setEditableValue(row, column.columnKey, value);

    if (error) {
      this.editableValidationError.emit({
        row,
        columnKey: column.columnKey,
        value,
        error,
      });
    }

    this.editableValueChange.emit({
      row,
      columnKey: column.columnKey,
      value,
      valid: error === null,
      error,
    });
  }

  private areEditableValuesEqual(leftValue: unknown, rightValue: unknown, column: EditableColumnDataItem): boolean {
    if (Object.is(leftValue, rightValue)) {
      return true;
    }

    const shouldCompareAsDate =
      column.editableType === 'date' || column.type === 'date' || column.type === 'datetime';

    if (!shouldCompareAsDate) {
      return false;
    }

    const leftDate = this.toDateValue(leftValue);
    const rightDate = this.toDateValue(rightValue);

    return leftDate !== null && rightDate !== null && leftDate.getTime() === rightDate.getTime();
  }

  private validateEditableValue(row: TableRow, column: EditableColumnDataItem, value: unknown): string | null {
    const rules = column.validation;
    if (!rules) {
      return null;
    }

    if (rules.required) {
      if (column.editableType === 'checkbox' || column.editableType === 'switch') {
        if (this.toBooleanValue(value) !== true) {
          return 'This field is required.';
        }
      } else if (this.isEmptyValue(value)) {
        return 'This field is required.';
      }
    }

    if (!this.isEmptyValue(value) && (rules.min !== undefined || rules.max !== undefined)) {
      const numericValue = this.toNumberValue(value);
      if (numericValue === null) {
        return 'Invalid numeric value.';
      }

      if (rules.min !== undefined && numericValue < rules.min) {
        return `Value must be greater than or equal to ${rules.min}.`;
      }

      if (rules.max !== undefined && numericValue > rules.max) {
        return `Value must be less than or equal to ${rules.max}.`;
      }
    }

    if (!this.isEmptyValue(value) && (rules.minLength !== undefined || rules.maxLength !== undefined)) {
      const textValue = this.toComparableString(value);

      if (rules.minLength !== undefined && textValue.length < rules.minLength) {
        return `Value must be at least ${rules.minLength} characters.`;
      }

      if (rules.maxLength !== undefined && textValue.length > rules.maxLength) {
        return `Value must be at most ${rules.maxLength} characters.`;
      }
    }

    if (rules.pattern && !this.isEmptyValue(value)) {
      try {
        const regex = new RegExp(rules.pattern);
        if (!regex.test(this.toComparableString(value))) {
          return 'Invalid format.';
        }
      } catch {
        return 'Invalid validation pattern.';
      }
    }

    if (rules.validator) {
      return rules.validator(value, row);
    }

    return null;
  }

  private normalizeInputValue(inputValue: string, column: EditableColumnDataItem): unknown {
    if (column.type !== 'number' && column.type !== 'currency') {
      return inputValue;
    }

    if (inputValue.trim().length === 0) {
      return '';
    }

    const parsedValue = Number(inputValue);
    return Number.isFinite(parsedValue) ? parsedValue : inputValue;
  }

  private resolveSelectValue(selectedValue: string, column: EditableColumnDataItem): unknown {
    const option = column.options?.find((item) => `${item.value}` === selectedValue);
    return option ? option.value : selectedValue;
  }

  private resolveComboboxValue(selectedValue: string | null, column: EditableColumnDataItem): unknown {
    if (selectedValue === null) {
      return null;
    }

    const option = column.options?.find((item) => `${item.value}` === selectedValue);
    return option ? option.value : selectedValue;
  }

  private getEditableValue(row: TableRow, column: EditableColumnDataItem): unknown {
    const valueByColumn = this.editableValuesState().get(row);

    if (valueByColumn?.has(column.columnKey)) {
      return valueByColumn.get(column.columnKey);
    }

    return this.getRawValue(row, column.columnKey);
  }

  private setEditableValue(row: TableRow, columnKey: string, value: unknown): void {
    const nextValues = new Map(this.editableValuesState());
    const valueByColumn = new Map(nextValues.get(row) ?? []);
    valueByColumn.set(columnKey, value);
    nextValues.set(row, valueByColumn);
    this.editableValuesState.set(nextValues);
  }

  private setEditableError(row: TableRow, columnKey: string, error: string | null): void {
    const nextErrors = new Map(this.editableErrorsState());
    const errorByColumn = new Map(nextErrors.get(row) ?? []);

    if (error) {
      errorByColumn.set(columnKey, error);
      nextErrors.set(row, errorByColumn);
      this.editableErrorsState.set(nextErrors);
      return;
    }

    errorByColumn.delete(columnKey);
    if (errorByColumn.size === 0) {
      nextErrors.delete(row);
    } else {
      nextErrors.set(row, errorByColumn);
    }
    this.editableErrorsState.set(nextErrors);
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

  private translateIfString(value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    if (value.trim().length === 0) {
      return value;
    }

    return this.translateString(value);
  }

  private translateString(value: string): string {
    return this.translateService.instant(value);
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

  private normalizeSizeValue(value: TableWidthValue | null | undefined): string | null {
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value <= 0) {
        return null;
      }

      return `${value}px`;
    }

    if (typeof value === 'string') {
      const normalizedValue = value.trim();
      if (normalizedValue.length === 0 || /[[\]]/.test(normalizedValue)) {
        return null;
      }

      const fractionSizeValue = this.resolveTailwindFractionSize(normalizedValue);
      if (fractionSizeValue !== null) {
        return fractionSizeValue;
      }

      return normalizedValue;
    }

    return null;
  }

  private resolveTailwindFractionSize(value: string): string | null {
    if (value === 'w-full' || value === 'full') {
      return '100%';
    }

    const fractionMatch = /^(?:(?:w|min-w|max-w)-)?(\d+)\/(\d+)$/.exec(value);
    if (!fractionMatch) {
      return null;
    }

    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) {
      return null;
    }

    const percent = (numerator / denominator) * 100;
    if (!Number.isFinite(percent) || percent <= 0) {
      return null;
    }

    const normalizedPercent = Number(percent.toFixed(6));
    return `${normalizedPercent}%`;
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
