import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { APP_COLOR_OPTIONS, APP_ICON_OPTIONS } from '@/config/visual-options.config';
import {
  type ActionItem,
  type EditableOptionItem,
  type EditableValueChangeEvent,
  type TableDataItem,
} from '@/components/data-table';
import type {
  CategoryType,
  TransactionCreateDto,
  TransactionCreateTransferDto,
  TransactionUpdateDto,
  TransactionUpdateTransferDto,
} from '@/dtos';
import { TransferModel, type TransactionModel } from '@/models';
import { AccountsService } from '@/services/accounts.service';
import { CategoriesService } from '@/services/categories.service';
import { TransactionsService } from '@/services/transactions.service';
import { ToolbarContextService, type ToolbarAction } from '@/services/toolbar-context.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardDialogService, type ZardDialogRef } from '@/shared/components/dialog';
import type { ZardIcon } from '@/shared/components/icon';
import { ZardSegmentedComponent, ZardSegmentedItemComponent } from '@/shared/components/segmented';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import {
  UpsertTransactionDialogComponent,
  type UpsertTransactionDialogData,
} from './components/upsert-transaction-dialog/upsert-transaction-dialog.component';
import {
  UpsertTransferDialogComponent,
  type UpsertTransferDialogData,
} from './components/upsert-transfer-dialog/upsert-transfer-dialog.component';
import { TransfersTableSectionComponent } from './sections/transfers-table-section/transfers-table-section.component';
import { TransactionsTableSectionComponent } from './sections/transactions-table-section/transactions-table-section.component';

const TRANSFER_CATEGORY_ID = 2;
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const APP_ICON_BY_VALUE = new Map(APP_ICON_OPTIONS.map((option) => [option.value, option.icon ?? null] as const));
const APP_COLOR_HEX_BY_VALUE = new Map(APP_COLOR_OPTIONS.map((option) => [option.value, option.colorHex ?? null] as const));

type TransactionsPageView = 'common' | 'transfers';

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

interface TransferTableRow {
  readonly transferId: string;
  readonly occurredAt: number;
  readonly fromAccountId: number;
  readonly fromAccount: string;
  readonly fromAccountIcon: ZardIcon | null;
  readonly fromAccountColorHex: string | null;
  readonly toAccountId: number;
  readonly toAccount: string;
  readonly toAccountIcon: ZardIcon | null;
  readonly toAccountColorHex: string | null;
  readonly amount: number;
}

const resolveIconByValue = (value: string | null): ZardIcon | null => {
  if (!value || value.length === 0) {
    return null;
  }

  return APP_ICON_BY_VALUE.get(value) ?? null;
};

const resolveColorHexByValue = (value: string | null): string | null => {
  if (!value || value.length === 0) {
    return null;
  }

  return APP_COLOR_HEX_BY_VALUE.get(value) ?? null;
};

const TRANSACTION_TABLE_COLUMNS: readonly TableDataItem[] =
  [
    {
      columnName: 'transactions.table.columns.occurredAt',
      columnKey: 'occurredAt',
      type: 'date',
      sortable: true,
    },
    {
      columnName: 'transactions.table.columns.settled',
      columnKey: 'settled',
      type: 'boolean',
      sortable: true,
      editableType: 'switch',
    },
    {
      columnName: 'transactions.table.columns.account',
      columnKey: 'account',
      type: 'badge',
      sortable: true,
      badge: {
        type: 'secondary',
        shape: 'pill',
        iconColumnKey: 'accountIcon',
        colorHexColumnKey: 'accountColorHex',
        fullWidth: true,
      },
    },
    {
      columnName: 'transactions.table.columns.amount',
      columnKey: 'amount',
      type: 'currency',
      sortable: true,
    },
    {
      columnName: 'transactions.table.columns.category',
      columnKey: 'category',
      type: 'badge',
      sortable: true,
      badge: {
        type: 'secondary',
        shape: 'pill',
        iconColumnKey: 'categoryIcon',
        colorHexColumnKey: 'categoryColorHex',
        fullWidth: true,
      },
    },
    {
      columnName: 'transactions.table.columns.description',
      columnKey: 'description',
      type: 'string',
      sortable: true,
    },
  ] as const;

const TRANSFER_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'transactions.transfers.table.columns.occurredAt',
    columnKey: 'occurredAt',
    type: 'date',
    sortable: true,
  },
  {
    columnName: 'transactions.transfers.table.columns.fromAccount',
    columnKey: 'fromAccount',
    type: 'badge',
    sortable: true,
    badge: {
      type: 'secondary',
      shape: 'pill',
      iconColumnKey: 'fromAccountIcon',
      colorHexColumnKey: 'fromAccountColorHex',
      fullWidth: true,
    },
  },
  {
    columnName: 'transactions.transfers.table.columns.toAccount',
    columnKey: 'toAccount',
    type: 'badge',
    sortable: true,
    badge: {
      type: 'secondary',
      shape: 'pill',
      iconColumnKey: 'toAccountIcon',
      colorHexColumnKey: 'toAccountColorHex',
      fullWidth: true,
    },
  },
  {
    columnName: 'transactions.transfers.table.columns.amount',
    columnKey: 'amount',
    type: 'currency',
    sortable: true,
  },
] as const;

const createTransactionTableStructure = (
  onEditAction: (row: object) => void | Promise<void>,
  onDeleteAction: (row: object) => void | Promise<void>,
): readonly TableDataItem[] =>
  [
    ...TRANSACTION_TABLE_COLUMNS,
    {
      actionItems: [
        {
          id: 'edit',
          icon: 'pencil',
          label: 'transactions.table.actions.edit',
          buttonType: 'ghost',
          action: onEditAction,
        },
        {
          id: 'delete',
          icon: 'trash',
          label: 'transactions.table.actions.delete',
          buttonType: 'ghost',
          action: onDeleteAction,
        },
      ],
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
    },
  ] as const;
};

@Component({
  selector: 'app-transaction-page',
  imports: [
    TranslatePipe,
    ZardSegmentedComponent,
    ZardSegmentedItemComponent,
    TransactionsTableSectionComponent,
    TransfersTableSectionComponent,
    ZardSkeletonComponent,
  ],
  templateUrl: './transaction-page.html',
})
export class TransactionPage implements OnInit, OnDestroy {
  protected readonly activeView = signal<TransactionsPageView>('common');
  protected readonly transactions = signal<readonly TransactionTableRow[]>([]);
  protected readonly transfers = signal<readonly TransferModel[]>([]);
  protected readonly transactionsTotal = signal(0);
  protected readonly transfersTotal = signal(0);
  protected readonly transactionsPage = signal(1);
  protected readonly transfersPage = signal(1);
  protected readonly transactionsPageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly transfersPageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly transactionsPageCount = computed(() =>
    Math.max(1, Math.ceil(this.transactionsTotal() / this.transactionsPageSize())),
  );
  protected readonly transfersPageCount = computed(() =>
    Math.max(1, Math.ceil(this.transfersTotal() / this.transfersPageSize())),
  );
  protected readonly transferRows = computed<readonly TransferTableRow[]>(() =>
    this.transfers().map((transfer) => this.toTransferRow(transfer)),
  );

  private readonly accountOptions = signal<readonly EditableOptionItem[]>([]);
  private readonly categoryOptions = signal<readonly EditableOptionItem[]>([]);
  private readonly accountNameById = signal<ReadonlyMap<number, string>>(new Map());
  private readonly categoryNameById = signal<ReadonlyMap<number, string>>(new Map());
  private readonly categoryTypeById = signal<ReadonlyMap<number, CategoryType>>(new Map());
  private readonly accountIconById = signal<ReadonlyMap<number, ZardIcon | null>>(new Map());
  private readonly categoryIconById = signal<ReadonlyMap<number, ZardIcon | null>>(new Map());
  private readonly accountColorHexById = signal<ReadonlyMap<number, string | null>>(new Map());
  private readonly categoryColorHexById = signal<ReadonlyMap<number, string | null>>(new Map());

  protected readonly transactionTableStructure = computed<readonly TableDataItem[]>(() =>
    createTransactionTableStructure(
      (row) => this.onEditTransaction(row),
      (row) => this.onDeleteTransaction(row),
    ),
  );

  protected readonly transferTableStructure = computed<readonly TableDataItem[]>(() =>
    createTransferTableStructure(
      (row) => this.onEditTransfer(row),
      (row) => this.onDeleteTransfer(row),
    ),
  );

  private readonly addTransactionToolbarAction: ToolbarAction = {
    id: 'add-transaction',
    label: 'transactions.table.actions.add',
    icon: 'plus',
    buttonType: 'default',
    disabled: () => this.accountOptions().length === 0 || this.categoryOptions().length === 0,
    action: () => this.openAddTransactionDialog(),
  };

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
    private readonly categoriesService: CategoriesService,
    private readonly toolbarContextService: ToolbarContextService,
    private readonly alertDialogService: ZardAlertDialogService,
    private readonly dialogService: ZardDialogService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    this.activateToolbarActions();
    void this.loadTransactionPageData();
  }

  ngOnDestroy(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
  }

  protected onViewChange(value: string): void {
    const nextView: TransactionsPageView = value === 'transfers' ? 'transfers' : 'common';
    if (nextView === this.activeView()) {
      return;
    }

    this.activeView.set(nextView);
    this.activateToolbarActions();
  }

  protected onTransactionsPageChange(page: number): void {
    if (page === this.transactionsPage()) {
      return;
    }

    this.transactionsPage.set(page);
    void this.reloadTransactionsPage();
  }

  protected onTransfersPageChange(page: number): void {
    if (page === this.transfersPage()) {
      return;
    }

    this.transfersPage.set(page);
    void this.reloadTransfersPage();
  }

  protected onTransactionsPageSizeChange(nextPageSize: number): void {
    if (
      !PAGE_SIZE_OPTIONS.includes(nextPageSize as (typeof PAGE_SIZE_OPTIONS)[number]) ||
      nextPageSize === this.transactionsPageSize()
    ) {
      return;
    }

    this.transactionsPageSize.set(nextPageSize);
    this.transactionsPage.set(1);
    void this.reloadTransactionsPage();
  }

  protected onTransfersPageSizeChange(nextPageSize: number): void {
    if (
      !PAGE_SIZE_OPTIONS.includes(nextPageSize as (typeof PAGE_SIZE_OPTIONS)[number]) ||
      nextPageSize === this.transfersPageSize()
    ) {
      return;
    }

    this.transfersPageSize.set(nextPageSize);
    this.transfersPage.set(1);
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

    const transaction = event.row as TransactionTableRow;
    void this.updateTransaction(transaction.id, { settled });
  }

  protected readonly transactionRowClass = (row: object): string => {
    const transaction = row as TransactionTableRow;

    if (transaction.categoryType === 'exclude') {
      return '';
    }

    if (transaction.amount > 0) {
      return 'transaction-row-positive';
    }

    if (transaction.amount < 0) {
      return 'transaction-row-negative';
    }

    return '';
  };

  private activateToolbarActions(): void {
    this.releaseToolbarActions?.();

    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.transactions',
      actions: this.activeView() === 'transfers'
        ? [this.addTransferToolbarAction]
        : [this.addTransactionToolbarAction],
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
          fromAccountId: transfer.fromAccountId,
          toAccountId: transfer.toAccountId,
          amount: transfer.amount,
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

  private async loadTransactionPageData(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const [accounts, categories, transactions, transferTransactions] = await Promise.all([
        this.accountsService.list({
          where: {
            archived: 0,
          },
          options: {
            orderBy: 'id',
            orderDirection: 'ASC',
          },
        }),
        this.categoriesService.list({
          where: {
            archived: 0,
          },
          options: {
            orderBy: 'id',
            orderDirection: 'ASC',
          },
        }),
        this.transactionsService.listTransactions({
          page: this.transactionsPage(),
          page_size: this.transactionsPageSize(),
        }),
        this.transactionsService.listTransfers({
          page: this.transfersPage(),
          page_size: this.transfersPageSize(),
        }),
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

      this.transactionsPage.set(transactions.page);
      this.transactionsTotal.set(transactions.total);
      this.transactions.set(transactions.rows.map((transaction) => this.toTransactionRow(transaction)));

      this.transfersPage.set(transferTransactions.page);
      this.transfersTotal.set(transferTransactions.total);
      this.transfers.set(TransferModel.fromTransactions(transferTransactions.rows));
    } catch (error) {
      this.transactions.set([]);
      this.transfers.set([]);
      this.transactionsTotal.set(0);
      this.transfersTotal.set(0);
      this.transactionsPage.set(1);
      this.transfersPage.set(1);
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
      console.error('[transaction-page] Failed to load transactions:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async reloadTransactionsPage(): Promise<void> {
    try {
      this.loadError.set(null);
      const transactions = await this.transactionsService.listTransactions({
        page: this.transactionsPage(),
        page_size: this.transactionsPageSize(),
      });

      this.transactionsPage.set(transactions.page);
      this.transactionsTotal.set(transactions.total);
      this.transactions.set(transactions.rows.map((transaction) => this.toTransactionRow(transaction)));
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading transactions.');
      console.error('[transaction-page] Failed to reload transactions:', error);
    }
  }

  private async reloadTransfersPage(): Promise<void> {
    try {
      this.loadError.set(null);
      const transfers = await this.transactionsService.listTransfers({
        page: this.transfersPage(),
        page_size: this.transfersPageSize(),
      });

      this.transfersPage.set(transfers.page);
      this.transfersTotal.set(transfers.total);
      this.transfers.set(TransferModel.fromTransactions(transfers.rows));
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading transfers.');
      console.error('[transaction-page] Failed to reload transfers:', error);
    }
  }

  private async updateTransaction(id: number, changes: TransactionUpdateDto['changes']): Promise<void> {
    try {
      const result = await this.transactionsService.update({ id, changes });

      if (result.row) {
        const updatedRow = this.toTransactionRow(result.row);
        this.transactions.update((rows) => rows.map((row) => (row.id === id ? updatedRow : row)));
        return;
      }

      if (result.changed > 0) {
        await this.reloadTransactionsPage();
      }
    } catch (error) {
      console.error('[transaction-page] Failed to update transaction:', error);
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
      console.error('[transaction-page] Failed to update transaction from dialog:', error);
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

      this.transactionsPage.set(1);
      await this.reloadTransactionsPage();
      dialogRef.close(created);
    } catch (error) {
      console.error('[transaction-page] Failed to create transaction:', error);
      dialogContent.setSubmitError('transactions.dialog.add.errors.createFailed');
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
      console.error('[transaction-page] Failed to delete transaction:', error);
      await this.reloadTransactionsPage();
    }
  }

  private async createTransfer(
    payload: TransactionCreateTransferDto,
    dialogContent: UpsertTransferDialogComponent,
    dialogRef: ZardDialogRef<UpsertTransferDialogComponent>,
  ): Promise<void> {
    try {
      const created = await this.transactionsService.createTransfer(payload);
      this.transfersPage.set(1);
      await this.reloadTransfersPage();
      dialogRef.close(created);
    } catch (error) {
      console.error('[transaction-page] Failed to create transfer:', error);
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
      console.error('[transaction-page] Failed to update transfer:', error);
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
      console.error('[transaction-page] Failed to delete transfer:', error);
      await this.reloadTransfersPage();
    }
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

  private toTransferRow(transfer: TransferModel): TransferTableRow {
    const fromAccountId = transfer.fromAccountId;
    const toAccountId = transfer.toAccountId;

    return {
      transferId: transfer.transferId,
      occurredAt: transfer.occurredAt,
      fromAccountId,
      fromAccount: this.accountNameById().get(fromAccountId) ?? `${fromAccountId}`,
      fromAccountIcon: this.accountIconById().get(fromAccountId) ?? null,
      fromAccountColorHex: this.accountColorHexById().get(fromAccountId) ?? null,
      toAccountId,
      toAccount: this.accountNameById().get(toAccountId) ?? `${toAccountId}`,
      toAccountIcon: this.accountIconById().get(toAccountId) ?? null,
      toAccountColorHex: this.accountColorHexById().get(toAccountId) ?? null,
      amount: transfer.amount,
    };
  }
}
