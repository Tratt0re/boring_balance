import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { APP_COLOR_OPTIONS, APP_ICON_OPTIONS } from '@/config/visual-options.config';
import {
  AppDataTableComponent,
  type EditableOptionItem,
  type EditableValueChangeEvent,
  type TableDataItem,
} from '@/components/data-table';
import type { TransactionCreateDto, TransactionUpdateDto } from '@/dtos';
import type { TransactionModel } from '@/models';
import { AccountsService } from '@/services/accounts.service';
import { CategoriesService } from '@/services/categories.service';
import { TransactionsService } from '@/services/transactions.service';
import { ToolbarContextService, type ToolbarAction } from '@/services/toolbar-context.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardDialogService, type ZardDialogRef } from '@/shared/components/dialog';
import type { ZardIcon } from '@/shared/components/icon';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import {
  UpsertTransactionDialogComponent,
  type UpsertTransactionDialogData,
} from './components/upsert-transaction-dialog/upsert-transaction-dialog.component';

const TRANSFER_CATEGORY_ID = 2;
const APP_ICON_BY_VALUE = new Map(APP_ICON_OPTIONS.map((option) => [option.value, option.icon ?? null] as const));
const APP_COLOR_HEX_BY_VALUE = new Map(APP_COLOR_OPTIONS.map((option) => [option.value, option.colorHex ?? null] as const));

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
  readonly category: string;
  readonly categoryIcon: ZardIcon | null;
  readonly categoryColorHex: string | null;
  readonly description: string | null;
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

@Component({
  selector: 'app-transaction-page',
  imports: [AppDataTableComponent, ZardSkeletonComponent],
  templateUrl: './transaction-page.html',
})
export class TransactionPage implements OnInit, OnDestroy {
  protected readonly transactions = signal<readonly TransactionTableRow[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  private readonly accountOptions = signal<readonly EditableOptionItem[]>([]);
  private readonly categoryOptions = signal<readonly EditableOptionItem[]>([]);
  private readonly accountNameById = signal<ReadonlyMap<number, string>>(new Map());
  private readonly categoryNameById = signal<ReadonlyMap<number, string>>(new Map());
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

  private readonly toolbarActions: readonly ToolbarAction[] = [
    {
      id: 'add-transaction',
      label: 'transactions.table.actions.add',
      icon: 'plus',
      buttonType: 'default',
      disabled: () => this.accountOptions().length === 0 || this.categoryOptions().length === 0,
      action: () => this.openAddTransactionDialog(),
    },
  ];
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
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.transactions',
      actions: this.toolbarActions,
    });
    void this.loadTransactionPageData();
  }

  ngOnDestroy(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
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

  private async loadTransactionPageData(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const [accounts, categories, transactions] = await Promise.all([
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
        this.listAllTransactions(),
      ]);

      const visibleCategories = categories.filter((category) => category.id !== TRANSFER_CATEGORY_ID);
      const visibleTransactions = transactions.filter((transaction) => transaction.categoryId !== TRANSFER_CATEGORY_ID);

      const accountNameById = new Map(accounts.map((account) => [account.id, account.name] as const));
      const categoryNameById = new Map(visibleCategories.map((category) => [category.id, category.name] as const));
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

      this.transactions.set(visibleTransactions.map((transaction) => this.toTransactionRow(transaction)));
    } catch (error) {
      this.transactions.set([]);
      this.accountOptions.set([]);
      this.categoryOptions.set([]);
      this.accountNameById.set(new Map());
      this.categoryNameById.set(new Map());
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

  private async listAllTransactions(): Promise<readonly TransactionModel[]> {
    return this.transactionsService.listTransactions();
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
        await this.loadTransactionPageData();
      }
    } catch (error) {
      console.error('[transaction-page] Failed to update transaction:', error);
      await this.loadTransactionPageData();
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
        const updatedRow = this.toTransactionRow(result.row);
        this.transactions.update((rows) => rows.map((row) => (row.id === id ? updatedRow : row)));
        dialogRef.close(result.row);
        return;
      }

      if (result.changed > 0) {
        await this.loadTransactionPageData();
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

      const createdRow = this.toTransactionRow(created);
      this.transactions.update((rows) =>
        [...rows, createdRow].sort(
          (left, right) =>
            Number(right.occurredAt) - Number(left.occurredAt) ||
            Number(right.id) - Number(left.id),
        ),
      );
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
        this.transactions.update((rows) => rows.filter((row) => row.id !== id));
        return;
      }

      await this.loadTransactionPageData();
    } catch (error) {
      console.error('[transaction-page] Failed to delete transaction:', error);
      await this.loadTransactionPageData();
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
      category: this.categoryNameById().get(transaction.categoryId) ?? `${transaction.categoryId}`,
      categoryIcon: this.categoryIconById().get(transaction.categoryId) ?? null,
      categoryColorHex: this.categoryColorHexById().get(transaction.categoryId) ?? null,
      description: transaction.description,
    };
  }
}
