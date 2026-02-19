import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  type ActionItem,
  AppDataTableComponent,
  type EditableOptionItem,
  type EditableValueChangeEvent,
  type TableDataItem,
} from '@/components/data-table';
import {
  APP_COLOR_OPTIONS,
  APP_ICON_OPTIONS,
  DEFAULT_VISUAL_COLOR_KEY,
  DEFAULT_VISUAL_ICON_KEY,
} from '@/config/visual-options.config';
import type { CategoryType, TransactionCreateDto, TransactionUpdateDto } from '@/dtos';
import { type TransactionModel } from '@/models';
import {
  UpsertTransactionDialogComponent,
  type UpsertTransactionDialogData,
} from '@/pages/transaction-page/components/upsert-transaction-dialog/upsert-transaction-dialog.component';
import { AccountsService } from '@/services/accounts.service';
import { CategoriesService } from '@/services/categories.service';
import { TransactionsService } from '@/services/transactions.service';
import { ToolbarContextService, type ToolbarAction } from '@/services/toolbar-context.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardDialogService, type ZardDialogRef } from '@/shared/components/dialog';
import type { ZardIcon } from '@/shared/components/icon';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';

const TRANSFER_CATEGORY_ID = 2;
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const TRANSACTION_COLUMN_WIDTH = {
  occurredAt: 'w-1/14',
  settled: 'w-1/14',
  account: 'w-2/28',
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

const TRANSACTION_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'transactions.table.columns.settled',
    columnKey: 'settled',
    type: 'boolean',
    sortable: true,
    editableType: 'checkbox',
    maxWidth: TRANSACTION_COLUMN_WIDTH.settled,
  },
  {
    columnName: 'transactions.table.columns.occurredAt',
    columnKey: 'occurredAt',
    type: 'date',
    sortable: true,
    maxWidth: TRANSACTION_COLUMN_WIDTH.occurredAt,
  },
  {
    columnName: 'transactions.table.columns.amount',
    columnKey: 'amount',
    type: 'currency',
    sortable: true,
    currency: {
      modality: 'currency-trend',
    },
    maxWidth: TRANSACTION_COLUMN_WIDTH.amount,
  },
  {
    columnName: 'transactions.table.columns.category',
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
    columnName: 'transactions.table.columns.account',
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
    columnName: 'transactions.table.columns.description',
    columnKey: 'description',
    type: 'string',
    sortable: true,
    maxWidth: TRANSACTION_COLUMN_WIDTH.description,
  },
] as const;

const createTransactionTableStructure = (
  onEditAction: (row: object) => void | Promise<void>,
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

  protected readonly tableStructure = computed<readonly TableDataItem[]>(() =>
    createTransactionTableStructure(
      (row) => this.onEditTransaction(row),
      (row) => this.onDeleteTransaction(row),
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

  private activateToolbarActions(): void {
    this.releaseToolbarActions?.();

    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.transactions',
      actions: [this.addTransactionToolbarAction],
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
        this.transactionsService.listTransactions({
          page: this.page(),
          page_size: this.pageSize(),
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

      this.page.set(transactions.page);
      this.total.set(transactions.total);
      this.rows.set(transactions.rows.map((transaction) => this.toTransactionRow(transaction)));
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
      const transactions = await this.transactionsService.listTransactions({
        page: this.page(),
        page_size: this.pageSize(),
      });

      this.page.set(transactions.page);
      this.total.set(transactions.total);
      this.rows.set(transactions.rows.map((transaction) => this.toTransactionRow(transaction)));
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
