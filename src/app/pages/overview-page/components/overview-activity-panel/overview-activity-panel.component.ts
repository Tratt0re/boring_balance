import {
  ChangeDetectionStrategy,
  Component,
  OnChanges,
  OnInit,
  SimpleChanges,
  TemplateRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { AppBaseCardComponent } from '@/components/base-card';
import { type EditableOptionItem } from '@/components/data-table';
import {
  APP_COLOR_OPTIONS,
  APP_ICON_OPTIONS,
  DEFAULT_VISUAL_COLOR_KEY,
  DEFAULT_VISUAL_ICON_KEY,
} from '@/config/visual-options.config';
import type { TransactionCreateDto, TransactionCreateTransferDto } from '@/dtos';
import {
  UpsertTransactionDialogComponent,
  type UpsertTransactionDialogData,
} from '@/pages/transaction-page/components/upsert-transaction-dialog/upsert-transaction-dialog.component';
import {
  UpsertTransferDialogComponent,
  type UpsertTransferDialogData,
} from '@/pages/transaction-page/components/upsert-transfer-dialog/upsert-transfer-dialog.component';
import { AccountsService } from '@/services/accounts.service';
import { CategoriesService } from '@/services/categories.service';
import { TransactionsService } from '@/services/transactions.service';
import { type ZardDialogRef, ZardDialogService } from '@/shared/components/dialog';
import { ZardButtonComponent } from '@/shared/components/button';
import { type ZardIcon } from '@/shared/components/icon';
import { ZardLoaderComponent } from '@/shared/components/loader';
import {
  ZardSegmentedComponent,
  ZardSegmentedItemComponent,
} from '@/shared/components/segmented';
import { toMonthRangeTimestamps } from '../overview-cards.utils';
import { ActivityTransactionRowComponent } from './activity-transaction-row.component';
import { ActivityTransferRowComponent } from './activity-transfer-row.component';
import type { ActivityTransactionRow, ActivityTransferRow } from './activity-row.types';

type OverviewActivityTab = 'transactions' | 'transfers';

const DEFAULT_TAB: OverviewActivityTab = 'transactions';
const MAX_ACTIVITY_ITEMS = 10;
const DEFAULT_LIMIT = MAX_ACTIVITY_ITEMS;
const TRANSFER_CATEGORY_ID = 2;
const APP_ICON_BY_VALUE = new Map(APP_ICON_OPTIONS.map((option) => [option.value, option.icon ?? null] as const));
const APP_COLOR_HEX_BY_VALUE = new Map(APP_COLOR_OPTIONS.map((option) => [option.value, option.colorHex ?? null] as const));
const DEFAULT_ACCOUNT_ICON = (APP_ICON_BY_VALUE.get(DEFAULT_VISUAL_ICON_KEY) ?? 'wallet') as ZardIcon;
const DEFAULT_CATEGORY_ICON = (APP_ICON_BY_VALUE.get(DEFAULT_VISUAL_ICON_KEY) ?? 'tag') as ZardIcon;
const DEFAULT_COLOR_HEX = APP_COLOR_HEX_BY_VALUE.get(DEFAULT_VISUAL_COLOR_KEY) ?? `var(--${DEFAULT_VISUAL_COLOR_KEY})`;

@Component({
  selector: 'app-overview-activity-panel',
  imports: [
    ActivityTransactionRowComponent,
    ActivityTransferRowComponent,
    AppBaseCardComponent,
    RouterLink,
    TranslatePipe,
    ZardButtonComponent,
    ZardLoaderComponent,
    ZardSegmentedComponent,
    ZardSegmentedItemComponent,
  ],
  templateUrl: './overview-activity-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full min-h-0',
  },
})
export class OverviewActivityPanelComponent implements OnInit, OnChanges {
  readonly year = input(new Date().getFullYear());
  readonly monthIndex = input(new Date().getMonth());
  readonly limit = input(DEFAULT_LIMIT);
  readonly defaultTab = input<OverviewActivityTab>(DEFAULT_TAB);
  readonly activityChanged = output<void>();

  private readonly accountOptions = signal<readonly EditableOptionItem[]>([]);
  private readonly categoryOptions = signal<readonly EditableOptionItem[]>([]);

  protected readonly cardTitleTpl = viewChild.required<TemplateRef<void>>('titleTpl');

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly activeTab = signal<OverviewActivityTab>(DEFAULT_TAB);
  protected readonly transactionRows = signal<readonly ActivityTransactionRow[]>([]);
  protected readonly transferRows = signal<readonly ActivityTransferRow[]>([]);
  protected readonly pendingTransactionSettledIds = signal<ReadonlySet<number>>(new Set<number>());
  protected readonly pendingTransferSettledIds = signal<ReadonlySet<string>>(new Set<string>());
  protected readonly activityItemLimit = computed(() => Math.min(MAX_ACTIVITY_ITEMS, this.normalizeLimit(this.limit())));
  protected readonly titleKey = 'overview.cards.activity.title';
  protected readonly descriptionKey = computed(() =>
    this.activeTab() === 'transactions'
      ? 'overview.cards.activity.latestTransactions'
      : 'overview.cards.activity.latestTransfers',
  );
  protected readonly accountCount = computed(() => this.accountOptions().length);
  protected readonly shouldPromptAccountCreation = computed(() =>
    this.activeTab() === 'transactions'
      ? this.accountCount() === 0
      : this.accountCount() < 2,
  );
  protected readonly emptyMessageKey = computed(() => {
    if (this.activeTab() === 'transactions') {
      return this.accountCount() === 0
        ? 'transactions.table.emptyNoAccountsMessage'
        : 'overview.cards.recentTransactions.empty';
    }

    if (this.accountCount() === 0) {
      return 'transactions.transfers.table.emptyNoAccountsMessage';
    }
    if (this.accountCount() < 2) {
      return 'transactions.transfers.table.emptyNeedTwoAccountsMessage';
    }

    return 'transactions.transfers.table.emptyMessage';
  });
  protected readonly quickActionLabelKey = computed(() =>
    this.shouldPromptAccountCreation()
      ? 'accounts.table.actions.add'
      : this.activeTab() === 'transactions'
        ? 'transactions.table.actions.add'
        : 'transactions.transfers.table.actions.add',
  );

  constructor(
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly dialogService: ZardDialogService,
    private readonly router: Router,
    private readonly transactionsService: TransactionsService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    void this.loadActivity();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const defaultTabChange = changes['defaultTab'];
    if (defaultTabChange) {
      this.activeTab.set(this.normalizeTab(this.defaultTab()));
    }

    const yearChange = changes['year'];
    const monthIndexChange = changes['monthIndex'];
    const limitChange = changes['limit'];
    if (
      (yearChange && !yearChange.firstChange) ||
      (monthIndexChange && !monthIndexChange.firstChange) ||
      (limitChange && !limitChange.firstChange)
    ) {
      void this.loadActivity();
    }
  }

  protected onTabChange(value: string): void {
    this.activeTab.set(this.normalizeTab(value));
  }

  protected onQuickAction(): void {
    if (this.shouldPromptAccountCreation()) {
      void this.router.navigate(['/accounts']);
      return;
    }

    if (this.activeTab() === 'transactions') {
      this.openAddTransactionDialog();
      return;
    }

    this.openAddTransferDialog();
  }

  protected isTransactionSettledUpdatePending(id: number): boolean {
    return this.pendingTransactionSettledIds().has(id);
  }

  protected isTransferSettledUpdatePending(transferId: string): boolean {
    return this.pendingTransferSettledIds().has(transferId);
  }

  protected async onTransactionSettledChange(rowId: number, nextSettled: boolean): Promise<void> {
    const currentRow = this.transactionRows().find((row) => row.id === rowId);
    if (!currentRow || this.isTransactionSettledUpdatePending(rowId)) {
      return;
    }

    const previousSettled = currentRow.settled;
    this.setPendingTransactionSettled(rowId, true);
    this.transactionRows.update((rows) =>
      rows.map((row) => (row.id === rowId ? { ...row, settled: nextSettled } : row)),
    );

    try {
      const result = await this.transactionsService.update({
        id: rowId,
        changes: { settled: nextSettled },
      });

      if (result.row) {
        this.transactionRows.update((rows) =>
          rows.map((row) =>
            row.id === rowId ? { ...row, settled: result.row?.settled ?? nextSettled } : row,
          ),
        );
      }
      this.activityChanged.emit();
      toast.success(this.translateService.instant('transactions.toasts.updateSuccess'));
    } catch (error) {
      console.error('[overview-activity-panel] Failed to update transaction settled state:', error);
      this.transactionRows.update((rows) =>
        rows.map((row) => (row.id === rowId ? { ...row, settled: previousSettled } : row)),
      );
      toast.error(this.translateService.instant('transactions.toasts.updateError'));
    } finally {
      this.setPendingTransactionSettled(rowId, false);
    }
  }

  protected async onTransferSettledChange(transferId: string, nextSettled: boolean): Promise<void> {
    const currentRow = this.transferRows().find((row) => row.transferId === transferId);
    if (!currentRow || this.isTransferSettledUpdatePending(transferId)) {
      return;
    }

    const previousSettled = currentRow.settled;
    this.setPendingTransferSettled(transferId, true);
    this.transferRows.update((rows) =>
      rows.map((row) => (row.transferId === transferId ? { ...row, settled: nextSettled } : row)),
    );

    try {
      const result = await this.transactionsService.updateTransfer({
        transfer_id: currentRow.transferId,
        occurred_at: currentRow.occurredAt,
        from_account_id: currentRow.fromAccountId,
        to_account_id: currentRow.toAccountId,
        amount: currentRow.amount,
        description: currentRow.description,
        settled: nextSettled,
      });

      this.transferRows.update((rows) =>
        rows.map((row) =>
          row.transferId === transferId
            ? {
                ...row,
                settled: result.transfer?.settled ?? nextSettled,
              }
            : row,
        ),
      );
      this.activityChanged.emit();
      toast.success(this.translateService.instant('transactions.transfers.toasts.updateSuccess'));
    } catch (error) {
      console.error('[overview-activity-panel] Failed to update transfer settled state:', error);
      this.transferRows.update((rows) =>
        rows.map((row) => (row.transferId === transferId ? { ...row, settled: previousSettled } : row)),
      );
      toast.error(this.translateService.instant('transactions.transfers.toasts.updateError'));
    } finally {
      this.setPendingTransferSettled(transferId, false);
    }
  }

  private async loadActivity(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const safeLimit = this.activityItemLimit();
      const { from, to } = toMonthRangeTimestamps(this.year(), this.monthIndex());
      const [accounts, categories, transactions, transfers] = await Promise.all([
        this.accountsService
          .listAll({
            where: { archived: 0 },
            options: {
              orderBy: 'id',
              orderDirection: 'ASC',
            },
          })
          .catch((error) => {
            console.warn('[overview-activity-panel] Failed to load account options:', error);
            return [];
          }),
        this.categoriesService
          .listAll({
            where: { archived: 0 },
            options: {
              orderBy: 'id',
              orderDirection: 'ASC',
            },
          })
          .catch((error) => {
            console.warn('[overview-activity-panel] Failed to load category options:', error);
            return [];
          }),
        this.transactionsService.listTransactions({
          page: 1,
          page_size: safeLimit,
          filters: {
            date_from: from,
            date_to: to,
          },
        }),
        this.transactionsService.listTransfers({
          page: 1,
          page_size: safeLimit,
          filters: {
            date_from: from,
            date_to: to,
          },
        }),
      ]);

      const accountNameById = new Map(accounts.map((account) => [account.id, account.name] as const));
      const accountIconById = new Map(
        accounts.map(
          (account) => [account.id, this.resolveVisualIcon(account.icon, DEFAULT_ACCOUNT_ICON)] as const,
        ),
      );
      const accountColorHexById = new Map(
        accounts.map((account) => [account.id, this.resolveVisualColorHex(account.colorKey)] as const),
      );
      const categoryNameById = new Map(categories.map((category) => [category.id, category.name] as const));
      const categoryIconById = new Map(
        categories.map(
          (category) => [category.id, this.resolveVisualIcon(category.icon, DEFAULT_CATEGORY_ICON)] as const,
        ),
      );
      const categoryColorHexById = new Map(
        categories.map((category) => [category.id, this.resolveVisualColorHex(category.colorKey)] as const),
      );
      const visibleCategories = categories.filter((category) => category.id !== TRANSFER_CATEGORY_ID);

      this.accountOptions.set(
        accounts.map((account) => ({
          label: account.name,
          value: account.id,
          icon: accountIconById.get(account.id) ?? undefined,
          colorHex: accountColorHexById.get(account.id) ?? undefined,
        })),
      );
      this.categoryOptions.set(
        visibleCategories.map((category) => ({
          label: category.name,
          value: category.id,
          icon: categoryIconById.get(category.id) ?? undefined,
          colorHex: categoryColorHexById.get(category.id) ?? undefined,
        })),
      );

      const unknownAccount = this.translate('overview.cards.recentTransactions.unknownAccount');
      const unknownCategory = this.translate('overview.cards.recentTransactions.unknownCategory');

      this.transactionRows.set(
        transactions.rows.map((transaction) => ({
          id: transaction.id,
          occurredAt: transaction.occurredAt,
          amount: transaction.amount,
          settled: transaction.settled,
          accountName: accountNameById.get(transaction.accountId) ?? unknownAccount,
          accountIcon: accountIconById.get(transaction.accountId) ?? DEFAULT_ACCOUNT_ICON,
          accountColorHex: accountColorHexById.get(transaction.accountId) ?? DEFAULT_COLOR_HEX,
          categoryName: categoryNameById.get(transaction.categoryId) ?? unknownCategory,
          categoryIcon: categoryIconById.get(transaction.categoryId) ?? DEFAULT_CATEGORY_ICON,
          categoryColorHex: categoryColorHexById.get(transaction.categoryId) ?? DEFAULT_COLOR_HEX,
          description: transaction.description,
        })).slice(0, safeLimit),
      );

      this.transferRows.set(
        transfers.rows.map((transfer) => ({
          transferId: transfer.transferId,
          occurredAt: transfer.occurredAt,
          amount: transfer.amount,
          settled: transfer.settled,
          fromAccountId: transfer.fromAccountId,
          toAccountId: transfer.toAccountId,
          fromAccountName: accountNameById.get(transfer.fromAccountId) ?? unknownAccount,
          fromAccountIcon: accountIconById.get(transfer.fromAccountId) ?? DEFAULT_ACCOUNT_ICON,
          fromAccountColorHex: accountColorHexById.get(transfer.fromAccountId) ?? DEFAULT_COLOR_HEX,
          toAccountName: accountNameById.get(transfer.toAccountId) ?? unknownAccount,
          toAccountIcon: accountIconById.get(transfer.toAccountId) ?? DEFAULT_ACCOUNT_ICON,
          toAccountColorHex: accountColorHexById.get(transfer.toAccountId) ?? DEFAULT_COLOR_HEX,
          description: transfer.description,
        })).slice(0, safeLimit),
      );
    } catch (error) {
      console.error('[overview-activity-panel] Failed to load activity:', error);
      this.accountOptions.set([]);
      this.categoryOptions.set([]);
      this.transactionRows.set([]);
      this.transferRows.set([]);
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading activity.');
    } finally {
      this.isLoading.set(false);
    }
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

  private async createTransaction(
    payload: TransactionCreateDto,
    dialogContent: UpsertTransactionDialogComponent,
    dialogRef: ZardDialogRef<UpsertTransactionDialogComponent>,
  ): Promise<void> {
    try {
      const created = await this.transactionsService.create(payload);
      if (!created) {
        dialogContent.setSubmitError('transactions.dialog.add.errors.createFailed');
        toast.error(this.translateService.instant('transactions.toasts.createError'));
        return;
      }

      await this.loadActivity();
      dialogRef.close(created);
      this.activityChanged.emit();
      toast.success(this.translateService.instant('transactions.toasts.createSuccess'));
    } catch (error) {
      console.error('[overview-activity-panel] Failed to create transaction:', error);
      dialogContent.setSubmitError('transactions.dialog.add.errors.createFailed');
      toast.error(this.translateService.instant('transactions.toasts.createError'));
    }
  }

  private openAddTransferDialog(): void {
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

  private async createTransfer(
    payload: TransactionCreateTransferDto,
    dialogContent: UpsertTransferDialogComponent,
    dialogRef: ZardDialogRef<UpsertTransferDialogComponent>,
  ): Promise<void> {
    try {
      const created = await this.transactionsService.createTransfer(payload);
      await this.loadActivity();
      dialogRef.close(created);
      this.activityChanged.emit();
      toast.success(this.translateService.instant('transactions.transfers.toasts.createSuccess'));
    } catch (error) {
      console.error('[overview-activity-panel] Failed to create transfer:', error);
      dialogContent.setSubmitError('transactions.transfers.dialog.add.errors.createFailed');
      toast.error(this.translateService.instant('transactions.transfers.toasts.createError'));
    }
  }

  private normalizeLimit(value: number): number {
    return Number.isInteger(value) && value > 0 ? value : DEFAULT_LIMIT;
  }

  private normalizeTab(value: string): OverviewActivityTab {
    return value === 'transfers' ? 'transfers' : 'transactions';
  }

  private setPendingTransactionSettled(id: number, isPending: boolean): void {
    this.pendingTransactionSettledIds.update((currentSet) => {
      const nextSet = new Set(currentSet);
      if (isPending) {
        nextSet.add(id);
      } else {
        nextSet.delete(id);
      }

      return nextSet;
    });
  }

  private setPendingTransferSettled(transferId: string, isPending: boolean): void {
    this.pendingTransferSettledIds.update((currentSet) => {
      const nextSet = new Set(currentSet);
      if (isPending) {
        nextSet.add(transferId);
      } else {
        nextSet.delete(transferId);
      }

      return nextSet;
    });
  }

  private resolveVisualIcon(iconValue: string | null | undefined, fallbackIcon: ZardIcon): ZardIcon {
    if (typeof iconValue !== 'string' || iconValue.trim().length === 0) {
      return fallbackIcon;
    }

    return (APP_ICON_BY_VALUE.get(iconValue) ?? fallbackIcon) as ZardIcon;
  }

  private resolveVisualColorHex(colorKey: string | null | undefined): string {
    if (typeof colorKey !== 'string' || colorKey.trim().length === 0) {
      return DEFAULT_COLOR_HEX;
    }

    return APP_COLOR_HEX_BY_VALUE.get(colorKey) ?? `var(--${colorKey})`;
  }


  private translate(key: string, params?: Record<string, unknown>): string {
    const translated = this.translateService.instant(key, params);
    return typeof translated === 'string' ? translated : key;
  }
}
