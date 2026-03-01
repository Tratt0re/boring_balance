import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  type ActionItem,
  AppDataTableComponent,
  type EditableOptionItem,
  type EditableValueChangeEvent,
  type TableActiveFilterItem,
  type TableHeaderActionItem,
  type TableDataItem,
} from '@/components/data-table';
import {
  AppSheetFormService,
  type AppSheetField,
  type AppSheetFieldValueMap,
  type AppSheetFormComponent,
} from '@/components/sheet-form';
import {
  APP_COLOR_OPTIONS,
  APP_ICON_OPTIONS,
  DEFAULT_VISUAL_COLOR_KEY,
  DEFAULT_VISUAL_ICON_KEY,
} from '@/config/visual-options.config';
import type { CategoryType, TransactionCreateDto, TransactionListTransactionsDto, TransactionUpdateDto } from '@/dtos';
import { type TransactionModel } from '@/models';
import {
  UpsertTransactionDialogComponent,
  type UpsertTransactionDialogData,
} from '@/pages/transaction-page/components/upsert-transaction-dialog/upsert-transaction-dialog.component';
import { AccountsService } from '@/services/accounts.service';
import { CategoriesService } from '@/services/categories.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { NumberFormatService } from '@/services/number-format.service';
import { TransactionsService } from '@/services/transactions.service';
import { ToolbarContextService, type ToolbarAction, type ToolbarItemNavigation } from '@/services/toolbar-context.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardDialogService, type ZardDialogRef } from '@/shared/components/dialog';
import type { ZardIcon } from '@/shared/components/icon';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';

const TRANSFER_CATEGORY_ID = 2;
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;
const TRANSACTION_FILTER_FIELD = {
  dateFrom: 'dateFrom',
  dateTo: 'dateTo',
  amountFrom: 'amountFrom',
  amountTo: 'amountTo',
  settled: 'settled',
  categoryType: 'categoryType',
  categoryId: 'categoryId',
  accountId: 'accountId',
} as const;
const ACTIVE_FILTER_ID_SEPARATOR = ':';
const TRANSACTION_COLUMN_WIDTH = {
  occurredAt: 'w-1/14',
  settled: 'w-1/14',
  account: 'w-1/14',
  amount: 'w-1/14',
  category: 'w-3/28',
  description: 'w-5/28',
  action: 'w-1/14',
} as const;
const APP_ICON_BY_VALUE = new Map(APP_ICON_OPTIONS.map((option) => [option.value, option.icon ?? null] as const));
const APP_COLOR_HEX_BY_VALUE = new Map(APP_COLOR_OPTIONS.map((option) => [option.value, option.colorHex ?? null] as const));
const DEFAULT_TABLE_ICON = (APP_ICON_BY_VALUE.get(DEFAULT_VISUAL_ICON_KEY) ?? 'circle') as ZardIcon;
const DEFAULT_TABLE_COLOR_HEX = APP_COLOR_HEX_BY_VALUE.get(DEFAULT_VISUAL_COLOR_KEY) ?? `var(--${DEFAULT_VISUAL_COLOR_KEY})`;

interface TransactionTableRow {
  readonly id: number;
  readonly occurredAt: number;
  readonly settled: boolean;
  readonly accountId: number;
  readonly account: string;
  readonly accountIcon: ZardIcon | null;
  readonly accountColorHex: string | null;
  readonly amount: number;
  readonly categoryId: number;
  readonly categoryType: CategoryType | null;
  readonly category: string;
  readonly categoryIcon: ZardIcon | null;
  readonly categoryColorHex: string | null;
  readonly description: string | null;
}

interface TransactionTableFilters {
  readonly dateFrom: Date | null;
  readonly dateTo: Date | null;
  readonly amountFrom: number | null;
  readonly amountTo: number | null;
  readonly settled: boolean | null;
  readonly categoryType: CategoryType | null;
  readonly categoryIds: readonly number[];
  readonly accountIds: readonly number[];
}

interface PersistedTransactionTableFilters {
  readonly dateFrom: number | null;
  readonly dateTo: number | null;
  readonly amountFrom: number | null;
  readonly amountTo: number | null;
  readonly settled: boolean | null;
  readonly categoryType: CategoryType | null;
  readonly categoryIds: readonly number[];
  readonly accountIds: readonly number[];
}

interface PersistedTransactionsTableState {
  readonly page: number;
  readonly pageSize: number;
  readonly filters: PersistedTransactionTableFilters;
}

const DEFAULT_TRANSACTION_TABLE_FILTERS: TransactionTableFilters = {
  dateFrom: null,
  dateTo: null,
  amountFrom: null,
  amountTo: null,
  settled: null,
  categoryType: null,
  categoryIds: [],
  accountIds: [],
};

const resolveIconByValue = (value: string | null): ZardIcon | null => {
  if (!value || value.length === 0) {
    return DEFAULT_TABLE_ICON;
  }

  return APP_ICON_BY_VALUE.get(value) ?? DEFAULT_TABLE_ICON;
};

const resolveColorHexByValue = (value: string | null): string | null => {
  if (!value || value.length === 0) {
    return DEFAULT_TABLE_COLOR_HEX;
  }

  return APP_COLOR_HEX_BY_VALUE.get(value) ?? DEFAULT_TABLE_COLOR_HEX;
};

const toCurrentMonthDateRange = (referenceDate: Date = new Date()): { dateFrom: Date; dateTo: Date } => {
  const year = referenceDate.getFullYear();
  const monthIndex = referenceDate.getMonth();

  return {
    dateFrom: new Date(year, monthIndex, 1, 0, 0, 0, 0),
    dateTo: new Date(year, monthIndex + 1, 0, 23, 59, 59, 999),
  };
};

const TRANSACTION_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'common.labels.settled',
    columnKey: 'settled',
    type: 'boolean',
    sortable: true,
    editableType: 'checkbox',
    maxWidth: TRANSACTION_COLUMN_WIDTH.settled,
  },
  {
    columnName: 'common.labels.date',
    columnKey: 'occurredAt',
    type: 'date',
    sortable: true,
    maxWidth: TRANSACTION_COLUMN_WIDTH.occurredAt,
  },
  {
    columnName: 'common.labels.amount',
    columnKey: 'amount',
    type: 'currency',
    sortable: true,
    currency: {
      modality: 'currency-trend',
    },
    maxWidth: TRANSACTION_COLUMN_WIDTH.amount,
  },
  {
    columnName: 'common.labels.category',
    columnKey: 'category',
    type: 'badge',
    sortable: true,
    maxWidth: TRANSACTION_COLUMN_WIDTH.category,
    badge: {
      type: 'secondary',
      shape: 'pill',
      iconColumnKey: 'categoryIcon',
      colorHexColumnKey: 'categoryColorHex',
      fullWidth: true,
    },
  },
  {
    columnName: 'common.labels.account',
    columnKey: 'account',
    type: 'string',
    sortable: true,
    maxWidth: TRANSACTION_COLUMN_WIDTH.account,
    cellIcon: {
      iconColumnKey: 'accountIcon',
      colorHexColumnKey: 'accountColorHex',
    },
  },
  {
    columnName: 'common.labels.description',
    columnKey: 'description',
    type: 'string',
    sortable: true,
    maxWidth: TRANSACTION_COLUMN_WIDTH.description,
  },
] as const;

const createTransactionTableStructure = (
  onEditAction: (row: object) => void | Promise<void>,
  onDuplicateAction: (row: object) => void | Promise<void>,
  onDeleteAction: (row: object) => void | Promise<void>,
): readonly TableDataItem[] =>
  [
    ...TRANSACTION_TABLE_COLUMNS,
    {
      minWidth: TRANSACTION_COLUMN_WIDTH.action,
      maxWidth: TRANSACTION_COLUMN_WIDTH.action,
      showLabel: false,
      actionItems: [
        {
          id: 'edit',
          icon: 'pencil',
          label: 'transactions.table.actions.edit',
          buttonType: 'ghost',
          action: onEditAction,
        },
        {
          id: 'duplicate',
          icon: 'copy',
          label: 'transactions.table.actions.duplicate',
          buttonType: 'ghost',
          action: onDuplicateAction,
        },
        {
          id: 'delete',
          icon: 'trash',
          label: 'transactions.table.actions.delete',
          buttonType: 'ghost',
          action: onDeleteAction,
        },
      ] as const satisfies readonly ActionItem[],
    },
  ] as const;

@Component({
  selector: 'app-transactions-table-section',
  imports: [AppDataTableComponent, TranslatePipe, ZardSkeletonComponent],
  templateUrl: './transactions-table-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsTableSectionComponent implements OnInit, OnDestroy {
  readonly toolbarItemNavigation = input<ToolbarItemNavigation | null>(null);

  protected readonly rows = signal<readonly TransactionTableRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  private readonly accountOptions = signal<readonly EditableOptionItem[]>([]);
  private readonly categoryOptions = signal<readonly EditableOptionItem[]>([]);
  private readonly accountNameById = signal<ReadonlyMap<number, string>>(new Map());
  private readonly categoryNameById = signal<ReadonlyMap<number, string>>(new Map());
  private readonly categoryTypeById = signal<ReadonlyMap<number, CategoryType>>(new Map());
  private readonly accountIconById = signal<ReadonlyMap<number, ZardIcon | null>>(new Map());
  private readonly categoryIconById = signal<ReadonlyMap<number, ZardIcon | null>>(new Map());
  private readonly accountColorHexById = signal<ReadonlyMap<number, string | null>>(new Map());
  private readonly categoryColorHexById = signal<ReadonlyMap<number, string | null>>(new Map());
  private readonly filters = signal<TransactionTableFilters>(DEFAULT_TRANSACTION_TABLE_FILTERS);

  protected readonly tableStructure = computed<readonly TableDataItem[]>(() =>
    createTransactionTableStructure(
      (row) => this.onEditTransaction(row),
      (row) => this.onDuplicateTransaction(row),
      (row) => this.onDeleteTransaction(row),
    ),
  );
  protected readonly hasActiveFilters = computed(() => {
    const filters = this.filters();

    return (
      filters.dateFrom !== null ||
      filters.dateTo !== null ||
      filters.amountFrom !== null ||
      filters.amountTo !== null ||
      filters.settled !== null ||
      filters.categoryType !== null ||
      filters.categoryIds.length > 0 ||
      filters.accountIds.length > 0
    );
  });
  protected readonly activeFilters = computed<readonly TableActiveFilterItem[]>(() => {
    const filters = this.filters();
    const items: TableActiveFilterItem[] = [];

    if (filters.dateFrom) {
      items.push({
        id: TRANSACTION_FILTER_FIELD.dateFrom,
        icon: 'calendar',
        label: this.toActiveFilterLabel(
          'common.filters.fields.dateFrom',
          this.formatActiveFilterDate(filters.dateFrom),
        ),
        translate: false,
      });
    }

    if (filters.dateTo) {
      items.push({
        id: TRANSACTION_FILTER_FIELD.dateTo,
        icon: 'calendar',
        label: this.toActiveFilterLabel(
          'common.filters.fields.dateTo',
          this.formatActiveFilterDate(filters.dateTo),
        ),
        translate: false,
      });
    }

    if (filters.amountFrom !== null) {
      items.push({
        id: TRANSACTION_FILTER_FIELD.amountFrom,
        icon: 'dollar-sign',
        label: this.toActiveFilterLabel(
          'common.filters.fields.amountFrom',
          this.formatActiveFilterAmount(filters.amountFrom),
        ),
        translate: false,
      });
    }

    if (filters.amountTo !== null) {
      items.push({
        id: TRANSACTION_FILTER_FIELD.amountTo,
        icon: 'dollar-sign',
        label: this.toActiveFilterLabel(
          'common.filters.fields.amountTo',
          this.formatActiveFilterAmount(filters.amountTo),
        ),
        translate: false,
      });
    }

    if (filters.settled !== null) {
      const settledLabelKey = filters.settled
        ? 'common.filters.options.settled.yes'
        : 'common.filters.options.settled.no';

      items.push({
        id: TRANSACTION_FILTER_FIELD.settled,
        icon: filters.settled ? 'circle-check' : 'circle-x',
        label: this.toActiveFilterLabel(
          'common.filters.fields.settled',
          this.translateService.instant(settledLabelKey),
        ),
        translate: false,
      });
    }

    if (filters.categoryType) {
      items.push({
        id: TRANSACTION_FILTER_FIELD.categoryType,
        icon: 'tag',
        label: this.toActiveFilterLabel(
          'common.filters.fields.categoryType',
          this.translateService.instant(`category.type.${filters.categoryType}`),
        ),
        translate: false,
      });
    }

    for (const categoryId of filters.categoryIds) {
      const categoryName = this.categoryNameById().get(categoryId) ?? `${categoryId}`;
      items.push({
        id: `${TRANSACTION_FILTER_FIELD.categoryId}${ACTIVE_FILTER_ID_SEPARATOR}${categoryId}`,
        icon: this.categoryIconById().get(categoryId) ?? 'tag',
        label: this.toActiveFilterLabel(
          'common.filters.fields.category',
          this.translateService.instant(categoryName),
        ),
        translate: false,
      });
    }

    for (const accountId of filters.accountIds) {
      items.push({
        id: `${TRANSACTION_FILTER_FIELD.accountId}${ACTIVE_FILTER_ID_SEPARATOR}${accountId}`,
        icon: this.accountIconById().get(accountId) ?? 'wallet',
        label: this.toActiveFilterLabel(
          'common.filters.fields.account',
          this.accountNameById().get(accountId) ?? `${accountId}`,
        ),
        translate: false,
      });
    }

    return items;
  });
  protected readonly tableActions = computed<readonly TableHeaderActionItem[]>(() => {
    const actions: TableHeaderActionItem[] = [
      {
        id: 'transaction-filters-current-month',
        icon: 'calendar',
        label: 'common.filters.actions.currentMonth',
        showLabel: false,
        buttonType: 'secondary',
        action: () => this.onApplyCurrentMonthFilterAction(),
      },
      {
        id: 'transaction-filters',
        icon: 'filter',
        label: 'transactions.table.actions.filter',
        showLabel: false,
        buttonType: 'outline',
        action: () => this.openFilterSheet(),
      },
    ];

    if (this.hasActiveFilters()) {
      actions.push({
        id: 'transaction-filters-reset',
        icon: 'funnel-x',
        label: 'common.filters.actions.reset',
        showLabel: false,
        buttonType: 'secondary',
        action: () => this.onResetFiltersAction(),
      });
    }

    return actions;
  });

  private readonly addTransactionToolbarAction: ToolbarAction = {
    id: 'add-transaction',
    label: 'transactions.table.actions.add',
    icon: 'plus',
    buttonType: 'default',
    disabled: () => this.accountOptions().length === 0 || this.categoryOptions().length === 0,
    action: () => this.openAddTransactionDialog(),
  };

  private releaseToolbarActions: (() => void) | null = null;

  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly localPreferencesService: LocalPreferencesService,
    private readonly numberFormatService: NumberFormatService,
    private readonly toolbarContextService: ToolbarContextService,
    private readonly alertDialogService: ZardAlertDialogService,
    private readonly dialogService: ZardDialogService,
    private readonly sheetFormService: AppSheetFormService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    this.restorePersistedTableState();
    this.activateToolbarActions();
    void this.loadInitialData();
  }

  ngOnDestroy(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
  }

  protected onPageChange(nextPage: number): void {
    if (nextPage === this.page()) {
      return;
    }

    this.page.set(nextPage);
    this.persistTableState();
    void this.reloadTransactionsPage();
  }

  protected onPageSizeChange(nextPageSize: number): void {
    if (
      !PAGE_SIZE_OPTIONS.includes(nextPageSize as (typeof PAGE_SIZE_OPTIONS)[number]) ||
      nextPageSize === this.pageSize()
    ) {
      return;
    }

    this.pageSize.set(nextPageSize);
    this.page.set(1);
    this.persistTableState();
    void this.reloadTransactionsPage();
  }

  protected onEditableValueChange(event: EditableValueChangeEvent): void {
    if (!event.valid || event.columnKey !== 'settled') {
      return;
    }

    const settled = this.toBooleanValue(event.value);
    if (settled === null) {
      return;
    }

    const transaction = event.row as TransactionTableRow;
    void this.updateTransaction(transaction.id, { settled });
  }

  protected onActiveFilterRemove(activeFilter: TableActiveFilterItem): void {
    const [fieldId, rawValue] = activeFilter.id.split(ACTIVE_FILTER_ID_SEPARATOR);
    const currentFilters = this.filters();

    let nextFilters: TransactionTableFilters | null = null;

    if (fieldId === TRANSACTION_FILTER_FIELD.dateFrom && currentFilters.dateFrom) {
      nextFilters = {
        ...currentFilters,
        dateFrom: null,
      };
    } else if (fieldId === TRANSACTION_FILTER_FIELD.dateTo && currentFilters.dateTo) {
      nextFilters = {
        ...currentFilters,
        dateTo: null,
      };
    } else if (fieldId === TRANSACTION_FILTER_FIELD.amountFrom && currentFilters.amountFrom !== null) {
      nextFilters = {
        ...currentFilters,
        amountFrom: null,
      };
    } else if (fieldId === TRANSACTION_FILTER_FIELD.amountTo && currentFilters.amountTo !== null) {
      nextFilters = {
        ...currentFilters,
        amountTo: null,
      };
    } else if (fieldId === TRANSACTION_FILTER_FIELD.settled && currentFilters.settled !== null) {
      nextFilters = {
        ...currentFilters,
        settled: null,
      };
    } else if (fieldId === TRANSACTION_FILTER_FIELD.categoryType && currentFilters.categoryType !== null) {
      nextFilters = {
        ...currentFilters,
        categoryType: null,
      };
    } else if (fieldId === TRANSACTION_FILTER_FIELD.categoryId) {
      const categoryId = this.toPositiveInteger(rawValue);
      if (!categoryId || !currentFilters.categoryIds.includes(categoryId)) {
        return;
      }

      nextFilters = {
        ...currentFilters,
        categoryIds: currentFilters.categoryIds.filter((id) => id !== categoryId),
      };
    } else if (fieldId === TRANSACTION_FILTER_FIELD.accountId) {
      const accountId = this.toPositiveInteger(rawValue);
      if (!accountId || !currentFilters.accountIds.includes(accountId)) {
        return;
      }

      nextFilters = {
        ...currentFilters,
        accountIds: currentFilters.accountIds.filter((id) => id !== accountId),
      };
    }

    if (!nextFilters) {
      return;
    }

    this.applyFiltersAndReload(nextFilters);
  }

  private openFilterSheet(): void {
    this.sheetFormService.open({
      zTitle: this.translateService.instant('transactions.filters.title'),
      zDescription: this.translateService.instant('transactions.filters.description'),
      zSide: 'right',
      zWidth: 'min(96vw, 420px)',
      zOkText: this.translateService.instant('common.filters.actions.apply'),
      zMiddleText: this.translateService.instant('common.filters.actions.reset'),
      zMiddleType: 'secondary',
      zCancelText: this.translateService.instant('common.filters.actions.cancel'),
      zOkIcon: 'check',
      zMiddleIcon: 'filter',
      zCancelIcon: 'x',
      zMaskClosable: true,
      validateBeforeSubmit: false,
      fields: this.buildFilterFields(),
      values: this.toSheetValues(this.filters()),
      zOnMiddle: (sheetContent) => {
        this.resetSheetFilters(sheetContent);
        return false;
      },
      onSubmit: (sheetContent) => {
        this.applySheetFilters(sheetContent.getValues());
        return sheetContent.getValues();
      },
    });
  }

  private onResetFiltersAction(): void {
    if (!this.hasActiveFilters()) {
      return;
    }

    this.applyFiltersAndReload(DEFAULT_TRANSACTION_TABLE_FILTERS);
  }

  private onApplyCurrentMonthFilterAction(): void {
    const { dateFrom, dateTo } = toCurrentMonthDateRange();
    this.applyFiltersAndReload({
      ...this.filters(),
      dateFrom,
      dateTo,
    });
  }

  private activateToolbarActions(): void {
    this.releaseToolbarActions?.();

    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.transactions',
      itemNavigation: this.toolbarItemNavigation(),
      itemActions: [this.addTransactionToolbarAction],
    });
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

  private buildFilterFields(): readonly AppSheetField[] {
    return [
      {
        id: TRANSACTION_FILTER_FIELD.dateFrom,
        type: 'date-picker',
        width: '1/2',
        label: 'common.filters.fields.dateFrom',
        placeholder: 'common.filters.placeholders.dateFrom',
        translate: true,
      },
      {
        id: TRANSACTION_FILTER_FIELD.dateTo,
        type: 'date-picker',
        width: '1/2',
        label: 'common.filters.fields.dateTo',
        placeholder: 'common.filters.placeholders.dateTo',
        translate: true,
      },
      {
        id: TRANSACTION_FILTER_FIELD.amountFrom,
        type: 'input',
        inputType: 'number',
        width: '1/2',
        label: 'common.filters.fields.amountFrom',
        placeholder: 'common.filters.placeholders.amountFrom',
        translate: true,
      },
      {
        id: TRANSACTION_FILTER_FIELD.amountTo,
        type: 'input',
        inputType: 'number',
        width: '1/2',
        label: 'common.filters.fields.amountTo',
        placeholder: 'common.filters.placeholders.amountTo',
        translate: true,
      },
      {
        id: TRANSACTION_FILTER_FIELD.settled,
        type: 'select',
        width: '1/1',
        label: 'common.filters.fields.settled',
        placeholder: 'common.filters.placeholders.settled',
        options: [
          {
            value: 'any',
            label: 'common.filters.options.settled.any',
            translate: true,
          },
          {
            value: 'true',
            label: 'common.filters.options.settled.yes',
            translate: true,
          },
          {
            value: 'false',
            label: 'common.filters.options.settled.no',
            translate: true,
          },
        ],
        translate: true,
      },
      {
        id: TRANSACTION_FILTER_FIELD.categoryType,
        type: 'select',
        width: '1/1',
        label: 'common.filters.fields.categoryType',
        placeholder: 'common.filters.placeholders.categoryType',
        options: [
          {
            value: 'any',
            label: 'common.filters.options.categoryType.any',
            translate: true,
          },
          {
            value: 'income',
            label: 'category.type.income',
            translate: true,
          },
          {
            value: 'expense',
            label: 'category.type.expense',
            translate: true,
          },
          {
            value: 'exclude',
            label: 'category.type.exclude',
            translate: true,
          },
        ],
        translate: true,
      },
      {
        id: TRANSACTION_FILTER_FIELD.categoryId,
        type: 'combobox',
        width: '1/1',
        multiple: true,
        maxLabelCount: 7,
        label: 'common.filters.fields.category',
        placeholder: 'common.filters.placeholders.category',
        searchPlaceholder: 'common.filters.placeholders.searchCategory',
        emptyText: 'transactions.filters.empty.category',
        translate: true,
        options: this.categoryOptions().map((option) => ({
          value: `${option.value}`,
          label: option.label,
          icon: option.icon,
          translate: option.translate,
        })),
      },
      {
        id: TRANSACTION_FILTER_FIELD.accountId,
        type: 'combobox',
        width: '1/1',
        multiple: true,
        maxLabelCount: 7,
        label: 'common.filters.fields.account',
        placeholder: 'common.filters.placeholders.account',
        searchPlaceholder: 'common.filters.placeholders.searchAccount',
        emptyText: 'transactions.filters.empty.account',
        translate: true,
        options: this.accountOptions().map((option) => ({
          value: `${option.value}`,
          label: option.label,
          icon: option.icon,
          translate: option.translate,
        })),
      },
    ];
  }

  private toSheetValues(filters: TransactionTableFilters): AppSheetFieldValueMap {
    return {
      [TRANSACTION_FILTER_FIELD.dateFrom]: filters.dateFrom,
      [TRANSACTION_FILTER_FIELD.dateTo]: filters.dateTo,
      [TRANSACTION_FILTER_FIELD.amountFrom]:
        filters.amountFrom === null ? null : `${filters.amountFrom}`,
      [TRANSACTION_FILTER_FIELD.amountTo]:
        filters.amountTo === null ? null : `${filters.amountTo}`,
      [TRANSACTION_FILTER_FIELD.settled]:
        filters.settled === null ? null : `${filters.settled}`,
      [TRANSACTION_FILTER_FIELD.categoryType]: filters.categoryType,
      [TRANSACTION_FILTER_FIELD.categoryId]: filters.categoryIds.map((id) => `${id}`),
      [TRANSACTION_FILTER_FIELD.accountId]: filters.accountIds.map((id) => `${id}`),
    };
  }

  private applySheetFilters(values: AppSheetFieldValueMap): void {
    const nextFilters: TransactionTableFilters = {
      dateFrom: this.toDateValue(values[TRANSACTION_FILTER_FIELD.dateFrom]),
      dateTo: this.toDateValue(values[TRANSACTION_FILTER_FIELD.dateTo]),
      amountFrom: this.toAmountFilterValue(values[TRANSACTION_FILTER_FIELD.amountFrom]),
      amountTo: this.toAmountFilterValue(values[TRANSACTION_FILTER_FIELD.amountTo]),
      settled: this.toSettledFilterValue(values[TRANSACTION_FILTER_FIELD.settled]),
      categoryType: this.toCategoryTypeFilterValue(values[TRANSACTION_FILTER_FIELD.categoryType]),
      categoryIds: this.toPositiveIntegerArray(values[TRANSACTION_FILTER_FIELD.categoryId]),
      accountIds: this.toPositiveIntegerArray(values[TRANSACTION_FILTER_FIELD.accountId]),
    };

    this.applyFiltersAndReload(nextFilters);
  }

  private resetSheetFilters(sheetContent: AppSheetFormComponent): void {
    const resetValues = this.toSheetValues(DEFAULT_TRANSACTION_TABLE_FILTERS);
    for (const [fieldId, value] of Object.entries(resetValues)) {
      sheetContent.setValue(fieldId, value ?? null);
    }
  }

  private buildListTransactionsPayload(): TransactionListTransactionsDto {
    const filters = this.filters();
    const dateFrom = filters.dateFrom?.getTime();
    const dateTo = filters.dateTo?.getTime();
    const amountFrom = filters.amountFrom ?? undefined;
    const amountTo = filters.amountTo ?? undefined;
    const categoryTypes = filters.categoryType ? [filters.categoryType] : undefined;
    const categories = filters.categoryIds.length > 0 ? [...filters.categoryIds] : undefined;
    const accounts = filters.accountIds.length > 0 ? [...filters.accountIds] : undefined;
    const settled = filters.settled === null ? undefined : filters.settled;
    const hasFilters =
      dateFrom !== undefined ||
      dateTo !== undefined ||
      amountFrom !== undefined ||
      amountTo !== undefined ||
      categoryTypes !== undefined ||
      categories !== undefined ||
      accounts !== undefined ||
      settled !== undefined;

    if (!hasFilters) {
      return {
        page: this.page(),
        page_size: this.pageSize(),
      };
    }

    return {
      page: this.page(),
      page_size: this.pageSize(),
      filters: {
        ...(dateFrom === undefined ? {} : { date_from: dateFrom }),
        ...(dateTo === undefined ? {} : { date_to: dateTo }),
        ...(amountFrom === undefined ? {} : { amount_from: amountFrom }),
        ...(amountTo === undefined ? {} : { amount_to: amountTo }),
        ...(categoryTypes === undefined ? {} : { category_types: categoryTypes }),
        ...(categories === undefined ? {} : { categories }),
        ...(accounts === undefined ? {} : { accounts }),
        ...(settled === undefined ? {} : { settled }),
      },
    };
  }

  private toPositiveIntegerArray(value: unknown): readonly number[] {
    if (Array.isArray(value)) {
      const uniqueValues = new Set<number>();

      for (const item of value) {
        const parsedValue = this.toPositiveInteger(item);
        if (parsedValue) {
          uniqueValues.add(parsedValue);
        }
      }

      return Array.from(uniqueValues);
    }

    const parsedValue = this.toPositiveInteger(value);
    return parsedValue ? [parsedValue] : [];
  }

  private toSettledFilterValue(value: unknown): boolean | null {
    if (value === true || value === 'true') {
      return true;
    }

    if (value === false || value === 'false') {
      return false;
    }

    return null;
  }

  private toCategoryTypeFilterValue(value: unknown): CategoryType | null {
    if (value === 'income' || value === 'expense' || value === 'exclude') {
      return value;
    }

    return null;
  }

  private toDateValue(value: unknown): Date | null {
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

  private onEditTransaction(row: object): void {
    const transaction = row as TransactionTableRow;
    let isUpdatingTransaction = false;

    const dialogRef = this.dialogService.create<UpsertTransactionDialogComponent, UpsertTransactionDialogData>({
      zTitle: this.translateService.instant('transactions.dialog.edit.title'),
      zDescription: this.translateService.instant('transactions.dialog.edit.description'),
      zContent: UpsertTransactionDialogComponent,
      zData: {
        accountOptions: this.accountOptions(),
        categoryOptions: this.categoryOptions(),
        transaction: {
          occurredAt: transaction.occurredAt,
          settled: transaction.settled,
          accountId: transaction.accountId,
          amount: transaction.amount,
          categoryId: transaction.categoryId,
          description: transaction.description,
        },
      },
      zWidth: 'min(96vw, 720px)',
      zMaskClosable: true,
      zOkText: this.translateService.instant('transactions.dialog.edit.actions.save'),
      zCancelText: this.translateService.instant('transactions.dialog.edit.actions.cancel'),
      zOkIcon: 'pencil',
      zOnOk: (dialogContent) => {
        if (isUpdatingTransaction) {
          return false;
        }

        const changes = dialogContent.collectUpdateChanges();
        if (!changes) {
          return false;
        }

        isUpdatingTransaction = true;
        void this
          .updateTransactionFromDialog(transaction.id, changes, dialogContent, dialogRef)
          .finally(() => {
            isUpdatingTransaction = false;
          });
        return false;
      },
    });
  }

  private onDeleteTransaction(row: object): void {
    const transaction = row as TransactionTableRow;

    this.alertDialogService.confirm({
      zTitle: this.translateService.instant('transactions.deleteAlert.title'),
      zDescription: this.translateService.instant('transactions.deleteAlert.description'),
      zOkText: this.translateService.instant('transactions.deleteAlert.actions.delete'),
      zCancelText: this.translateService.instant('transactions.deleteAlert.actions.cancel'),
      zOkDestructive: true,
      zMaskClosable: true,
      zClosable: true,
      zOnOk: () => {
        void this.deleteTransaction(transaction.id);
      },
    });
  }

  private onDuplicateTransaction(row: object): void {
    const transaction = row as TransactionTableRow;

    this.alertDialogService.confirm({
      zTitle: this.translateService.instant('transactions.duplicateAlert.title'),
      zDescription: this.translateService.instant('transactions.duplicateAlert.description'),
      zOkText: this.translateService.instant('transactions.duplicateAlert.actions.duplicate'),
      zCancelText: this.translateService.instant('transactions.duplicateAlert.actions.cancel'),
      zMaskClosable: true,
      zClosable: true,
      zOnOk: () => {
        void this.duplicateTransaction(transaction.id);
      },
    });
  }

  private openAddTransactionDialog(): void {
    let isCreatingTransaction = false;

    const dialogRef = this.dialogService.create<UpsertTransactionDialogComponent, UpsertTransactionDialogData>({
      zTitle: this.translateService.instant('transactions.dialog.add.title'),
      zDescription: this.translateService.instant('transactions.dialog.add.description'),
      zContent: UpsertTransactionDialogComponent,
      zData: {
        accountOptions: this.accountOptions(),
        categoryOptions: this.categoryOptions(),
      },
      zWidth: 'min(96vw, 720px)',
      zMaskClosable: true,
      zOkText: this.translateService.instant('transactions.dialog.add.actions.create'),
      zCancelText: this.translateService.instant('transactions.dialog.add.actions.cancel'),
      zOkIcon: 'plus',
      zOnOk: (dialogContent) => {
        if (isCreatingTransaction) {
          return false;
        }

        const payload = dialogContent.collectCreatePayload();
        if (!payload) {
          return false;
        }

        isCreatingTransaction = true;
        void this
          .createTransaction(payload, dialogContent, dialogRef)
          .finally(() => {
            isCreatingTransaction = false;
          });
        return false;
      },
    });
  }

  private async loadInitialData(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const [accounts, categories, transactions] = await Promise.all([
        this.accountsService.listAll({
          where: {
            archived: 0,
          },
          options: {
            orderBy: 'id',
            orderDirection: 'ASC',
          },
        }),
        this.categoriesService.listAll({
          where: {
            archived: 0,
          },
          options: {
            orderBy: 'id',
            orderDirection: 'ASC',
          },
        }),
        this.transactionsService.listTransactions(this.buildListTransactionsPayload()),
      ]);

      const visibleCategories = categories.filter((category) => category.id !== TRANSFER_CATEGORY_ID);

      const accountNameById = new Map(accounts.map((account) => [account.id, account.name] as const));
      const categoryNameById = new Map(visibleCategories.map((category) => [category.id, category.name] as const));
      const categoryTypeById = new Map(visibleCategories.map((category) => [category.id, category.type] as const));
      const accountIconById = new Map(
        accounts.map((account) => [account.id, resolveIconByValue(account.icon)] as const),
      );
      const categoryIconById = new Map(
        visibleCategories.map((category) => [category.id, resolveIconByValue(category.icon)] as const),
      );
      const accountColorHexById = new Map(
        accounts.map((account) => [account.id, resolveColorHexByValue(account.colorKey)] as const),
      );
      const categoryColorHexById = new Map(
        visibleCategories.map((category) => [category.id, resolveColorHexByValue(category.colorKey)] as const),
      );

      this.accountNameById.set(accountNameById);
      this.categoryNameById.set(categoryNameById);
      this.categoryTypeById.set(categoryTypeById);
      this.accountIconById.set(accountIconById);
      this.categoryIconById.set(categoryIconById);
      this.accountColorHexById.set(accountColorHexById);
      this.categoryColorHexById.set(categoryColorHexById);
      this.accountOptions.set(
        accounts.map((account) => ({
          label: account.name,
          value: account.id,
          icon: resolveIconByValue(account.icon) ?? undefined,
          colorHex: resolveColorHexByValue(account.colorKey) ?? undefined,
        })),
      );
      this.categoryOptions.set(
        visibleCategories.map((category) => ({
          label: category.name,
          value: category.id,
          icon: resolveIconByValue(category.icon) ?? undefined,
          colorHex: resolveColorHexByValue(category.colorKey) ?? undefined,
        })),
      );

      this.page.set(transactions.page);
      this.total.set(transactions.total);
      this.rows.set(transactions.rows.map((transaction) => this.toTransactionRow(transaction)));
      this.persistTableState();
    } catch (error) {
      this.rows.set([]);
      this.total.set(0);
      this.page.set(1);
      this.accountOptions.set([]);
      this.categoryOptions.set([]);
      this.accountNameById.set(new Map());
      this.categoryNameById.set(new Map());
      this.categoryTypeById.set(new Map());
      this.accountIconById.set(new Map());
      this.categoryIconById.set(new Map());
      this.accountColorHexById.set(new Map());
      this.categoryColorHexById.set(new Map());
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading transactions.');
      console.error('[transactions-table-section] Failed to load transactions:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async reloadTransactionsPage(): Promise<void> {
    try {
      this.loadError.set(null);
      const transactions = await this.transactionsService.listTransactions(this.buildListTransactionsPayload());

      this.page.set(transactions.page);
      this.total.set(transactions.total);
      this.rows.set(transactions.rows.map((transaction) => this.toTransactionRow(transaction)));
      this.persistTableState();
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading transactions.');
      console.error('[transactions-table-section] Failed to reload transactions:', error);
    }
  }

  private async updateTransaction(id: number, changes: TransactionUpdateDto['changes']): Promise<void> {
    try {
      const result = await this.transactionsService.update({ id, changes });

      if (result.row) {
        const updatedRow = this.toTransactionRow(result.row);
        this.rows.update((rows) => rows.map((row) => (row.id === id ? updatedRow : row)));
        return;
      }

      if (result.changed > 0) {
        await this.reloadTransactionsPage();
      }
    } catch (error) {
      console.error('[transactions-table-section] Failed to update transaction:', error);
      await this.reloadTransactionsPage();
    }
  }

  private async updateTransactionFromDialog(
    id: number,
    changes: TransactionUpdateDto['changes'],
    dialogContent: UpsertTransactionDialogComponent,
    dialogRef: ZardDialogRef<UpsertTransactionDialogComponent>,
  ): Promise<void> {
    try {
      const result = await this.transactionsService.update({ id, changes });

      if (result.row) {
        await this.reloadTransactionsPage();
        dialogRef.close(result.row);
        return;
      }

      if (result.changed > 0) {
        await this.reloadTransactionsPage();
      }
      dialogRef.close({ id, changes });
    } catch (error) {
      console.error('[transactions-table-section] Failed to update transaction from dialog:', error);
      dialogContent.setSubmitError('transactions.dialog.edit.errors.updateFailed');
    }
  }

  private async createTransaction(
    payload: TransactionCreateDto,
    dialogContent: UpsertTransactionDialogComponent,
    dialogRef: ZardDialogRef<UpsertTransactionDialogComponent>,
  ): Promise<void> {
    try {
      const created = await this.transactionsService.create(payload);
      if (!created) {
        dialogContent.setSubmitError('transactions.dialog.add.errors.createFailed');
        return;
      }

      this.page.set(1);
      await this.reloadTransactionsPage();
      dialogRef.close(created);
    } catch (error) {
      console.error('[transactions-table-section] Failed to create transaction:', error);
      dialogContent.setSubmitError('transactions.dialog.add.errors.createFailed');
    }
  }

  private async duplicateTransaction(id: number): Promise<void> {
    try {
      const sourceTransaction = await this.transactionsService.get({ id });
      if (!sourceTransaction) {
        return;
      }

      const createdTransaction = await this.transactionsService.create({
        occurred_at: sourceTransaction.occurredAt,
        account_id: sourceTransaction.accountId,
        category_id: sourceTransaction.categoryId,
        amount: sourceTransaction.amount,
        description: sourceTransaction.description,
        tags: sourceTransaction.tags,
        settled: sourceTransaction.settled,
      });

      if (!createdTransaction) {
        return;
      }

      await this.reloadTransactionsPage();
    } catch (error) {
      console.error('[transactions-table-section] Failed to duplicate transaction:', error);
      await this.reloadTransactionsPage();
    }
  }

  private async deleteTransaction(id: number): Promise<void> {
    try {
      const result = await this.transactionsService.remove({ id });
      if (result.changed > 0) {
        await this.reloadTransactionsPage();
        return;
      }

      await this.reloadTransactionsPage();
    } catch (error) {
      console.error('[transactions-table-section] Failed to delete transaction:', error);
      await this.reloadTransactionsPage();
    }
  }

  private restorePersistedTableState(): void {
    const persistedState =
      this.localPreferencesService.getTransactionsTableState<Partial<PersistedTransactionsTableState>>();
    if (!persistedState) {
      return;
    }

    const parsedPageSize = this.toAllowedPageSize(persistedState.pageSize);
    const parsedPage = this.toPositiveInteger(persistedState.page) ?? 1;
    const parsedFilters = this.toPersistedFilters(persistedState.filters);

    this.pageSize.set(parsedPageSize);
    this.page.set(parsedPage);
    this.filters.set(parsedFilters);
  }

  private persistTableState(): void {
    const filters = this.filters();
    const state: PersistedTransactionsTableState = {
      page: this.page(),
      pageSize: this.pageSize(),
      filters: {
        dateFrom: filters.dateFrom?.getTime() ?? null,
        dateTo: filters.dateTo?.getTime() ?? null,
        amountFrom: filters.amountFrom,
        amountTo: filters.amountTo,
        settled: filters.settled,
        categoryType: filters.categoryType,
        categoryIds: [...filters.categoryIds],
        accountIds: [...filters.accountIds],
      },
    };

    this.localPreferencesService.setTransactionsTableState(state);
  }

  private toPersistedFilters(value: unknown): TransactionTableFilters {
    if (!value || typeof value !== 'object') {
      return DEFAULT_TRANSACTION_TABLE_FILTERS;
    }

    const filters = value as Partial<PersistedTransactionTableFilters>;
    return {
      dateFrom: this.toDateValue(filters.dateFrom),
      dateTo: this.toDateValue(filters.dateTo),
      amountFrom: this.toAmountFilterValue(filters.amountFrom),
      amountTo: this.toAmountFilterValue(filters.amountTo),
      settled: this.toSettledFilterValue(filters.settled),
      categoryType: this.toCategoryTypeFilterValue(filters.categoryType),
      categoryIds: this.toPositiveIntegerArray(filters.categoryIds),
      accountIds: this.toPositiveIntegerArray(filters.accountIds),
    };
  }

  private toPositiveInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsedValue = Number.parseInt(value, 10);
      return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
    }

    return null;
  }

  private toAllowedPageSize(value: unknown): number {
    const pageSize = this.toPositiveInteger(value);
    if (!pageSize) {
      return DEFAULT_PAGE_SIZE;
    }

    return PAGE_SIZE_OPTIONS.includes(pageSize as (typeof PAGE_SIZE_OPTIONS)[number]) ? pageSize : DEFAULT_PAGE_SIZE;
  }

  private toAmountFilterValue(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsedValue = Number(value);
      return Number.isFinite(parsedValue) ? parsedValue : null;
    }

    return null;
  }

  private applyFiltersAndReload(nextFilters: TransactionTableFilters): void {
    this.filters.set(nextFilters);
    this.page.set(1);
    this.persistTableState();
    void this.reloadTransactionsPage();
  }

  private toActiveFilterLabel(labelKey: string, value: string): string {
    return `${this.translateService.instant(labelKey)}: ${value}`;
  }

  private formatActiveFilterDate(date: Date): string {
    return new Intl.DateTimeFormat(this.resolveLocale(), {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(date);
  }

  private formatActiveFilterAmount(amount: number): string {
    return this.numberFormatService.formatCurrency(amount);
  }

  private resolveLocale(): string {
    const currentLanguage = this.translateService.currentLang?.trim();
    return currentLanguage && currentLanguage.length > 0 ? currentLanguage : 'en';
  }

  private toTransactionRow(transaction: TransactionModel): TransactionTableRow {
    return {
      id: transaction.id,
      occurredAt: transaction.occurredAt,
      settled: transaction.settled,
      accountId: transaction.accountId,
      account: this.accountNameById().get(transaction.accountId) ?? `${transaction.accountId}`,
      accountIcon: this.accountIconById().get(transaction.accountId) ?? null,
      accountColorHex: this.accountColorHexById().get(transaction.accountId) ?? null,
      amount: transaction.amount,
      categoryId: transaction.categoryId,
      categoryType: this.categoryTypeById().get(transaction.categoryId) ?? null,
      category: this.categoryNameById().get(transaction.categoryId) ?? `${transaction.categoryId}`,
      categoryIcon: this.categoryIconById().get(transaction.categoryId) ?? null,
      categoryColorHex: this.categoryColorHexById().get(transaction.categoryId) ?? null,
      description: transaction.description,
    };
  }
}
