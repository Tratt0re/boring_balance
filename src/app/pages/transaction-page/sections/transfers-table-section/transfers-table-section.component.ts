import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  type ActionItem,
  AppDataTableComponent,
  type EditableOptionItem,
  type EditableValueChangeEvent,
  type TableActiveFilterItem,
  type TableDataItem,
  type TableHeaderActionItem,
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
import type {
  TransactionCreateTransferDto,
  TransactionListTransfersDto,
  TransactionUpdateTransferDto,
} from '@/dtos';
import { TransferModel } from '@/models';
import {
  UpsertTransferDialogComponent,
  type UpsertTransferDialogData,
} from '@/pages/transaction-page/components/upsert-transfer-dialog/upsert-transfer-dialog.component';
import { AccountsService } from '@/services/accounts.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { NumberFormatService } from '@/services/number-format.service';
import { TransactionsService } from '@/services/transactions.service';
import { ToolbarContextService, type ToolbarAction, type ToolbarItemNavigation } from '@/services/toolbar-context.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardDialogService, type ZardDialogRef } from '@/shared/components/dialog';
import type { ZardIcon } from '@/shared/components/icon';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;
const TRANSFER_FILTER_FIELD = {
  dateFrom: 'dateFrom',
  dateTo: 'dateTo',
  amountFrom: 'amountFrom',
  amountTo: 'amountTo',
  settled: 'settled',
  accountId: 'accountId',
} as const;
const ACTIVE_FILTER_ID_SEPARATOR = ':';
const TRANSFER_COLUMN_WIDTH = {
  settled: 'w-1/14',
  occurredAt: 'w-1/8',
  amount: 'w-1/10',
  transferFrom: 'w-1/13',
  transferTo: 'w-1/13',
  description: 'w-5/28',
  action: 'w-1/14',
} as const;
const APP_ICON_BY_VALUE = new Map(APP_ICON_OPTIONS.map((option) => [option.value, option.icon ?? null] as const));
const APP_COLOR_HEX_BY_VALUE = new Map(APP_COLOR_OPTIONS.map((option) => [option.value, option.colorHex ?? null] as const));
const DEFAULT_TABLE_ICON = (APP_ICON_BY_VALUE.get(DEFAULT_VISUAL_ICON_KEY) ?? 'circle') as ZardIcon;
const DEFAULT_TABLE_COLOR_HEX = APP_COLOR_HEX_BY_VALUE.get(DEFAULT_VISUAL_COLOR_KEY) ?? `var(--${DEFAULT_VISUAL_COLOR_KEY})`;

interface TransferTableRow {
  readonly transferId: string;
  readonly occurredAt: number;
  readonly settled: boolean;
  readonly fromAccountId: number;
  readonly fromAccount: string;
  readonly fromAccountIcon: ZardIcon | null;
  readonly fromAccountColorHex: string | null;
  readonly toAccountId: number;
  readonly toAccount: string;
  readonly toAccountIcon: ZardIcon | null;
  readonly toAccountColorHex: string | null;
  readonly amount: number;
  readonly description: string | null;
}

interface TransferTableFilters {
  readonly dateFrom: Date | null;
  readonly dateTo: Date | null;
  readonly amountFrom: number | null;
  readonly amountTo: number | null;
  readonly settled: boolean | null;
  readonly accountIds: readonly number[];
}

interface PersistedTransferTableFilters {
  readonly dateFrom: number | null;
  readonly dateTo: number | null;
  readonly amountFrom: number | null;
  readonly amountTo: number | null;
  readonly settled: boolean | null;
  readonly accountIds: readonly number[];
}

interface PersistedTransfersTableState {
  readonly page: number;
  readonly pageSize: number;
  readonly filters: PersistedTransferTableFilters;
}

const DEFAULT_TRANSFER_TABLE_FILTERS: TransferTableFilters = {
  dateFrom: null,
  dateTo: null,
  amountFrom: null,
  amountTo: null,
  settled: null,
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

const TRANSFER_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'common.labels.settled',
    columnKey: 'settled',
    type: 'boolean',
    sortable: true,
    editableType: 'checkbox',
    maxWidth: TRANSFER_COLUMN_WIDTH.settled,
  },
  {
    columnName: 'common.labels.date',
    columnKey: 'occurredAt',
    type: 'date',
    sortable: true,
    maxWidth: TRANSFER_COLUMN_WIDTH.occurredAt,
  },
  {
    columnName: 'common.labels.from',
    columnKey: 'fromAccount',
    type: 'string',
    sortable: true,
    cellIcon: {
      iconColumnKey: 'fromAccountIcon',
      colorHexColumnKey: 'fromAccountColorHex',
    },
    maxWidth: TRANSFER_COLUMN_WIDTH.transferFrom,
  },
  {
    columnName: 'common.labels.to',
    columnKey: 'toAccount',
    type: 'string',
    sortable: true,
    cellIcon: {
      iconColumnKey: 'toAccountIcon',
      colorHexColumnKey: 'toAccountColorHex',
    },
    maxWidth: TRANSFER_COLUMN_WIDTH.transferTo,
  },
  {
    columnName: 'common.labels.amount',
    columnKey: 'amount',
    type: 'currency',
    sortable: true,
    currency: {
      modality: 'transfer',
    },
    maxWidth: TRANSFER_COLUMN_WIDTH.amount,
  },
  {
    columnName: 'common.labels.description',
    columnKey: 'description',
    type: 'string',
    sortable: true,
    maxWidth: TRANSFER_COLUMN_WIDTH.description
  },
] as const;

const createTransferTableStructure = (
  onEditTransfer: (row: object) => void | Promise<void>,
  onDeleteTransfer: (row: object) => void | Promise<void>,
): readonly TableDataItem[] => {
  const transferActions: readonly ActionItem[] = [
    {
      id: 'edit-transfer',
      icon: 'pencil',
      label: 'transactions.transfers.table.actions.edit',
      buttonType: 'ghost',
      action: onEditTransfer,
    },
    {
      id: 'delete-transfer',
      icon: 'trash',
      label: 'transactions.transfers.table.actions.delete',
      buttonType: 'ghost',
      action: onDeleteTransfer,
    },
  ];

  return [
    ...TRANSFER_TABLE_COLUMNS,
    {
      actionItems: transferActions,
      maxWidth: TRANSFER_COLUMN_WIDTH.action,
    },
  ] as const;
};

@Component({
  selector: 'app-transfers-table-section',
  imports: [AppDataTableComponent, TranslatePipe, ZardSkeletonComponent],
  templateUrl: './transfers-table-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransfersTableSectionComponent implements OnInit, OnDestroy {
  readonly toolbarItemNavigation = input<ToolbarItemNavigation | null>(null);

  protected readonly transfers = signal<readonly TransferModel[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly rows = computed<readonly TransferTableRow[]>(() =>
    this.transfers().map((transfer) => this.toTransferRow(transfer)),
  );

  private readonly accountOptions = signal<readonly EditableOptionItem[]>([]);
  private readonly accountNameById = signal<ReadonlyMap<number, string>>(new Map());
  private readonly accountIconById = signal<ReadonlyMap<number, ZardIcon | null>>(new Map());
  private readonly accountColorHexById = signal<ReadonlyMap<number, string | null>>(new Map());
  private readonly filters = signal<TransferTableFilters>(DEFAULT_TRANSFER_TABLE_FILTERS);

  protected readonly tableStructure = computed<readonly TableDataItem[]>(() =>
    createTransferTableStructure(
      (row) => this.onEditTransfer(row),
      (row) => this.onDeleteTransfer(row),
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
      filters.accountIds.length > 0
    );
  });
  protected readonly activeFilters = computed<readonly TableActiveFilterItem[]>(() => {
    const filters = this.filters();
    const items: TableActiveFilterItem[] = [];

    if (filters.dateFrom) {
      items.push({
        id: TRANSFER_FILTER_FIELD.dateFrom,
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
        id: TRANSFER_FILTER_FIELD.dateTo,
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
        id: TRANSFER_FILTER_FIELD.amountFrom,
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
        id: TRANSFER_FILTER_FIELD.amountTo,
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
        id: TRANSFER_FILTER_FIELD.settled,
        icon: filters.settled ? 'circle-check' : 'circle-x',
        label: this.toActiveFilterLabel(
          'common.filters.fields.settled',
          this.translateService.instant(settledLabelKey),
        ),
        translate: false,
      });
    }

    for (const accountId of filters.accountIds) {
      items.push({
        id: `${TRANSFER_FILTER_FIELD.accountId}${ACTIVE_FILTER_ID_SEPARATOR}${accountId}`,
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
        id: 'transfer-filters-current-month',
        icon: 'calendar',
        label: 'common.filters.actions.currentMonth',
        showLabel: false,
        buttonType: 'secondary',
        action: () => this.onApplyCurrentMonthFilterAction(),
      },
      {
        id: 'transfer-filters',
        icon: 'filter',
        label: 'transactions.transfers.table.actions.filter',
        showLabel: false,
        buttonType: 'outline',
        action: () => this.openFilterSheet(),
      },
    ];

    if (this.hasActiveFilters()) {
      actions.push({
        id: 'transfer-filters-reset',
        icon: 'funnel-x',
        label: 'common.filters.actions.reset',
        showLabel: false,
        buttonType: 'secondary',
        action: () => this.onResetFiltersAction(),
      });
    }

    return actions;
  });

  private readonly addTransferToolbarAction: ToolbarAction = {
    id: 'add-transfer',
    label: 'transactions.transfers.table.actions.add',
    icon: 'plus',
    buttonType: 'default',
    disabled: () => this.accountOptions().length < 2,
    action: () => this.openCreateTransferDialog(),
  };

  private releaseToolbarActions: (() => void) | null = null;

  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly accountsService: AccountsService,
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
    void this.reloadTransfersPage();
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
    void this.reloadTransfersPage();
  }

  protected onEditableValueChange(event: EditableValueChangeEvent): void {
    if (!event.valid || event.columnKey !== 'settled') {
      return;
    }

    const settled = this.toBooleanValue(event.value);
    if (settled === null) {
      return;
    }

    const transfer = event.row as TransferTableRow;
    if (transfer.settled === settled) {
      return;
    }

    void this.updateTransferSettled(transfer, settled);
  }

  protected onActiveFilterRemove(activeFilter: TableActiveFilterItem): void {
    const [fieldId, rawValue] = activeFilter.id.split(ACTIVE_FILTER_ID_SEPARATOR);
    const currentFilters = this.filters();

    let nextFilters: TransferTableFilters | null = null;

    if (fieldId === TRANSFER_FILTER_FIELD.dateFrom && currentFilters.dateFrom) {
      nextFilters = {
        ...currentFilters,
        dateFrom: null,
      };
    } else if (fieldId === TRANSFER_FILTER_FIELD.dateTo && currentFilters.dateTo) {
      nextFilters = {
        ...currentFilters,
        dateTo: null,
      };
    } else if (fieldId === TRANSFER_FILTER_FIELD.amountFrom && currentFilters.amountFrom !== null) {
      nextFilters = {
        ...currentFilters,
        amountFrom: null,
      };
    } else if (fieldId === TRANSFER_FILTER_FIELD.amountTo && currentFilters.amountTo !== null) {
      nextFilters = {
        ...currentFilters,
        amountTo: null,
      };
    } else if (fieldId === TRANSFER_FILTER_FIELD.settled && currentFilters.settled !== null) {
      nextFilters = {
        ...currentFilters,
        settled: null,
      };
    } else if (fieldId === TRANSFER_FILTER_FIELD.accountId) {
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

  private activateToolbarActions(): void {
    this.releaseToolbarActions?.();

    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.transactions',
      itemNavigation: this.toolbarItemNavigation(),
      itemActions: [this.addTransferToolbarAction],
    });
  }

  private openFilterSheet(): void {
    this.sheetFormService.open({
      zTitle: this.translateService.instant('transactions.transfers.filters.title'),
      zDescription: this.translateService.instant('transactions.transfers.filters.description'),
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

    this.applyFiltersAndReload(DEFAULT_TRANSFER_TABLE_FILTERS);
  }

  private onApplyCurrentMonthFilterAction(): void {
    const { dateFrom, dateTo } = toCurrentMonthDateRange();
    this.applyFiltersAndReload({
      ...this.filters(),
      dateFrom,
      dateTo,
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
        id: TRANSFER_FILTER_FIELD.dateFrom,
        type: 'date-picker',
        width: '1/2',
        label: 'common.filters.fields.dateFrom',
        placeholder: 'common.filters.placeholders.dateFrom',
        translate: true,
      },
      {
        id: TRANSFER_FILTER_FIELD.dateTo,
        type: 'date-picker',
        width: '1/2',
        label: 'common.filters.fields.dateTo',
        placeholder: 'common.filters.placeholders.dateTo',
        translate: true,
      },
      {
        id: TRANSFER_FILTER_FIELD.amountFrom,
        type: 'input',
        inputType: 'number',
        width: '1/2',
        label: 'common.filters.fields.amountFrom',
        placeholder: 'common.filters.placeholders.amountFrom',
        translate: true,
      },
      {
        id: TRANSFER_FILTER_FIELD.amountTo,
        type: 'input',
        inputType: 'number',
        width: '1/2',
        label: 'common.filters.fields.amountTo',
        placeholder: 'common.filters.placeholders.amountTo',
        translate: true,
      },
      {
        id: TRANSFER_FILTER_FIELD.settled,
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
        id: TRANSFER_FILTER_FIELD.accountId,
        type: 'combobox',
        width: '1/1',
        multiple: true,
        maxLabelCount: 7,
        label: 'common.filters.fields.account',
        placeholder: 'common.filters.placeholders.account',
        searchPlaceholder: 'common.filters.placeholders.searchAccount',
        emptyText: 'transactions.transfers.filters.empty.account',
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

  private toSheetValues(filters: TransferTableFilters): AppSheetFieldValueMap {
    return {
      [TRANSFER_FILTER_FIELD.dateFrom]: filters.dateFrom,
      [TRANSFER_FILTER_FIELD.dateTo]: filters.dateTo,
      [TRANSFER_FILTER_FIELD.amountFrom]:
        filters.amountFrom === null ? null : `${filters.amountFrom}`,
      [TRANSFER_FILTER_FIELD.amountTo]:
        filters.amountTo === null ? null : `${filters.amountTo}`,
      [TRANSFER_FILTER_FIELD.settled]:
        filters.settled === null ? null : `${filters.settled}`,
      [TRANSFER_FILTER_FIELD.accountId]: filters.accountIds.map((id) => `${id}`),
    };
  }

  private applySheetFilters(values: AppSheetFieldValueMap): void {
    const nextFilters: TransferTableFilters = {
      dateFrom: this.toDateValue(values[TRANSFER_FILTER_FIELD.dateFrom]),
      dateTo: this.toDateValue(values[TRANSFER_FILTER_FIELD.dateTo]),
      amountFrom: this.toAmountFilterValue(values[TRANSFER_FILTER_FIELD.amountFrom]),
      amountTo: this.toAmountFilterValue(values[TRANSFER_FILTER_FIELD.amountTo]),
      settled: this.toSettledFilterValue(values[TRANSFER_FILTER_FIELD.settled]),
      accountIds: this.toPositiveIntegerArray(values[TRANSFER_FILTER_FIELD.accountId]),
    };

    this.applyFiltersAndReload(nextFilters);
  }

  private resetSheetFilters(sheetContent: AppSheetFormComponent): void {
    const resetValues = this.toSheetValues(DEFAULT_TRANSFER_TABLE_FILTERS);
    for (const [fieldId, value] of Object.entries(resetValues)) {
      sheetContent.setValue(fieldId, value ?? null);
    }
  }

  private buildListTransfersPayload(): TransactionListTransfersDto {
    const filters = this.filters();
    const dateFrom = filters.dateFrom?.getTime();
    const dateTo = filters.dateTo?.getTime();
    const amountFrom = filters.amountFrom ?? undefined;
    const amountTo = filters.amountTo ?? undefined;
    const settled = filters.settled === null ? undefined : filters.settled;
    const accounts = filters.accountIds.length > 0 ? [...filters.accountIds] : undefined;
    const hasFilters =
      dateFrom !== undefined ||
      dateTo !== undefined ||
      amountFrom !== undefined ||
      amountTo !== undefined ||
      settled !== undefined ||
      accounts !== undefined;

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
        ...(settled === undefined ? {} : { settled }),
        ...(accounts === undefined ? {} : { accounts }),
      },
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

  private toSettledFilterValue(value: unknown): boolean | null {
    if (value === true || value === 'true') {
      return true;
    }

    if (value === false || value === 'false') {
      return false;
    }

    return null;
  }

  private applyFiltersAndReload(nextFilters: TransferTableFilters): void {
    this.filters.set(nextFilters);
    this.page.set(1);
    this.persistTableState();
    void this.reloadTransfersPage();
  }

  private async loadInitialData(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const [accounts, transferRows] = await Promise.all([
        this.accountsService.listAll({
          where: {
            archived: 0,
          },
          options: {
            orderBy: 'id',
            orderDirection: 'ASC',
          },
        }),
        this.transactionsService.listTransfers(this.buildListTransfersPayload()),
      ]);

      const accountNameById = new Map(accounts.map((account) => [account.id, account.name] as const));
      const accountIconById = new Map(
        accounts.map((account) => [account.id, resolveIconByValue(account.icon)] as const),
      );
      const accountColorHexById = new Map(
        accounts.map((account) => [account.id, resolveColorHexByValue(account.colorKey)] as const),
      );

      this.accountNameById.set(accountNameById);
      this.accountIconById.set(accountIconById);
      this.accountColorHexById.set(accountColorHexById);
      this.accountOptions.set(
        accounts.map((account) => ({
          label: account.name,
          value: account.id,
          icon: resolveIconByValue(account.icon) ?? undefined,
          colorHex: resolveColorHexByValue(account.colorKey) ?? undefined,
        })),
      );

      this.page.set(transferRows.page);
      this.total.set(transferRows.total);
      this.transfers.set(transferRows.rows);
      this.persistTableState();
    } catch (error) {
      this.transfers.set([]);
      this.total.set(0);
      this.page.set(1);
      this.accountOptions.set([]);
      this.accountNameById.set(new Map());
      this.accountIconById.set(new Map());
      this.accountColorHexById.set(new Map());
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading transfers.');
      console.error('[transfers-table-section] Failed to load transfers:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async reloadTransfersPage(): Promise<void> {
    try {
      this.loadError.set(null);
      const transfers = await this.transactionsService.listTransfers(this.buildListTransfersPayload());

      this.page.set(transfers.page);
      this.total.set(transfers.total);
      this.transfers.set(transfers.rows);
      this.persistTableState();
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading transfers.');
      console.error('[transfers-table-section] Failed to reload transfers:', error);
    }
  }

  private async updateTransferSettled(transfer: TransferTableRow, settled: boolean): Promise<void> {
    try {
      const result = await this.transactionsService.updateTransfer({
        transfer_id: transfer.transferId,
        occurred_at: transfer.occurredAt,
        from_account_id: transfer.fromAccountId,
        to_account_id: transfer.toAccountId,
        amount: transfer.amount,
        description: transfer.description,
        settled,
      });

      this.transfers.update((rows) =>
        rows.map((row) => (row.transferId === transfer.transferId ? result.transfer : row)),
      );
    } catch (error) {
      console.error('[transfers-table-section] Failed to update transfer settled:', error);
      await this.reloadTransfersPage();
    }
  }

  private async createTransfer(
    payload: TransactionCreateTransferDto,
    dialogContent: UpsertTransferDialogComponent,
    dialogRef: ZardDialogRef<UpsertTransferDialogComponent>,
  ): Promise<void> {
    try {
      const created = await this.transactionsService.createTransfer(payload);
      this.page.set(1);
      this.persistTableState();
      await this.reloadTransfersPage();
      dialogRef.close(created);
    } catch (error) {
      console.error('[transfers-table-section] Failed to create transfer:', error);
      dialogContent.setSubmitError('transactions.transfers.dialog.add.errors.createFailed');
    }
  }

  private async updateTransfer(
    payload: TransactionUpdateTransferDto,
    dialogContent: UpsertTransferDialogComponent,
    dialogRef: ZardDialogRef<UpsertTransferDialogComponent>,
  ): Promise<void> {
    try {
      const updated = await this.transactionsService.updateTransfer(payload);
      await this.reloadTransfersPage();
      dialogRef.close(updated);
    } catch (error) {
      console.error('[transfers-table-section] Failed to update transfer:', error);
      dialogContent.setSubmitError('transactions.transfers.dialog.edit.errors.updateFailed');
    }
  }

  private async deleteTransfer(transferId: string): Promise<void> {
    try {
      const result = await this.transactionsService.deleteTransfer({ transfer_id: transferId });
      if (result.changed > 0) {
        await this.reloadTransfersPage();
        return;
      }

      await this.reloadTransfersPage();
    } catch (error) {
      console.error('[transfers-table-section] Failed to delete transfer:', error);
      await this.reloadTransfersPage();
    }
  }

  private restorePersistedTableState(): void {
    const persistedState =
      this.localPreferencesService.getTransfersTableState<Partial<PersistedTransfersTableState>>();
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
    const state: PersistedTransfersTableState = {
      page: this.page(),
      pageSize: this.pageSize(),
      filters: {
        dateFrom: filters.dateFrom?.getTime() ?? null,
        dateTo: filters.dateTo?.getTime() ?? null,
        amountFrom: filters.amountFrom,
        amountTo: filters.amountTo,
        settled: filters.settled,
        accountIds: [...filters.accountIds],
      },
    };

    this.localPreferencesService.setTransfersTableState(state);
  }

  private toPersistedFilters(value: unknown): TransferTableFilters {
    if (!value || typeof value !== 'object') {
      return DEFAULT_TRANSFER_TABLE_FILTERS;
    }

    const filters = value as Partial<PersistedTransferTableFilters>;
    return {
      dateFrom: this.toDateValue(filters.dateFrom),
      dateTo: this.toDateValue(filters.dateTo),
      amountFrom: this.toAmountFilterValue(filters.amountFrom),
      amountTo: this.toAmountFilterValue(filters.amountTo),
      settled: this.toSettledFilterValue(filters.settled),
      accountIds: this.toPositiveIntegerArray(filters.accountIds),
    };
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

  private onEditTransfer(row: object): void {
    const transfer = row as TransferTableRow;
    let isUpdatingTransfer = false;

    const dialogRef = this.dialogService.create<UpsertTransferDialogComponent, UpsertTransferDialogData>({
      zTitle: this.translateService.instant('transactions.transfers.dialog.edit.title'),
      zDescription: this.translateService.instant('transactions.transfers.dialog.edit.description'),
      zContent: UpsertTransferDialogComponent,
      zData: {
        accountOptions: this.accountOptions(),
        transfer: {
          transferId: transfer.transferId,
          occurredAt: transfer.occurredAt,
          settled: transfer.settled,
          fromAccountId: transfer.fromAccountId,
          toAccountId: transfer.toAccountId,
          amount: transfer.amount,
          description: transfer.description,
        },
      },
      zWidth: 'min(96vw, 720px)',
      zMaskClosable: true,
      zOkText: this.translateService.instant('transactions.transfers.dialog.edit.actions.save'),
      zCancelText: this.translateService.instant('transactions.transfers.dialog.edit.actions.cancel'),
      zOkIcon: 'pencil',
      zOnOk: (dialogContent) => {
        if (isUpdatingTransfer) {
          return false;
        }

        const payload = dialogContent.collectUpdatePayload();
        if (!payload) {
          return false;
        }

        isUpdatingTransfer = true;
        void this
          .updateTransfer(payload, dialogContent, dialogRef)
          .finally(() => {
            isUpdatingTransfer = false;
          });
        return false;
      },
    });
  }

  private onDeleteTransfer(row: object): void {
    const transfer = row as TransferTableRow;

    this.alertDialogService.confirm({
      zTitle: this.translateService.instant('transactions.transfers.deleteAlert.title'),
      zDescription: this.translateService.instant('transactions.transfers.deleteAlert.description'),
      zOkText: this.translateService.instant('transactions.transfers.deleteAlert.actions.delete'),
      zCancelText: this.translateService.instant('transactions.transfers.deleteAlert.actions.cancel'),
      zOkDestructive: true,
      zMaskClosable: true,
      zClosable: true,
      zOnOk: () => {
        void this.deleteTransfer(transfer.transferId);
      },
    });
  }

  private openCreateTransferDialog(): void {
    let isCreatingTransfer = false;

    const dialogRef = this.dialogService.create<UpsertTransferDialogComponent, UpsertTransferDialogData>({
      zTitle: this.translateService.instant('transactions.transfers.dialog.add.title'),
      zDescription: this.translateService.instant('transactions.transfers.dialog.add.description'),
      zContent: UpsertTransferDialogComponent,
      zData: {
        accountOptions: this.accountOptions(),
      },
      zWidth: 'min(96vw, 720px)',
      zMaskClosable: true,
      zOkText: this.translateService.instant('transactions.transfers.dialog.add.actions.create'),
      zCancelText: this.translateService.instant('transactions.transfers.dialog.add.actions.cancel'),
      zOkIcon: 'plus',
      zOnOk: (dialogContent) => {
        if (isCreatingTransfer) {
          return false;
        }

        const payload = dialogContent.collectCreatePayload();
        if (!payload) {
          return false;
        }

        isCreatingTransfer = true;
        void this
          .createTransfer(payload, dialogContent, dialogRef)
          .finally(() => {
            isCreatingTransfer = false;
          });
        return false;
      },
    });
  }

  private toTransferRow(transfer: TransferModel): TransferTableRow {
    const fromAccountId = transfer.fromAccountId;
    const toAccountId = transfer.toAccountId;

    return {
      transferId: transfer.transferId,
      occurredAt: transfer.occurredAt,
      settled: transfer.settled,
      fromAccountId,
      fromAccount: this.accountNameById().get(fromAccountId) ?? `${fromAccountId}`,
      fromAccountIcon: this.accountIconById().get(fromAccountId) ?? null,
      fromAccountColorHex: this.accountColorHexById().get(fromAccountId) ?? null,
      toAccountId,
      toAccount: this.accountNameById().get(toAccountId) ?? `${toAccountId}`,
      toAccountIcon: this.accountIconById().get(toAccountId) ?? null,
      toAccountColorHex: this.accountColorHexById().get(toAccountId) ?? null,
      amount: transfer.amount,
      description: transfer.description,
    };
  }
}
