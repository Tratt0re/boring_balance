import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import {
  APP_COLOR_KEY_SET,
  APP_COLOR_OPTIONS,
  APP_ICON_KEY_SET,
  APP_ICON_OPTIONS,
} from '@/config/visual-options.config';
import {
  AppDataTableComponent,
  type EditableOptionItem,
  type EditableValueChangeEvent,
  type ActionItem,
  type TableDataItem,
} from '@/components/data-table';
import type {
  AccountCreateDto,
  AccountUpdateDto,
  TransactionCreateTransferDto,
  TransactionUpdateTransferDto,
} from '@/dtos';
import { AccountModel, TransferModel, type TransactionModel } from '@/models';
import { AccountsService } from '@/services/accounts.service';
import { TransactionsService } from '@/services/transactions.service';
import { ToolbarContextService, type ToolbarAction } from '@/services/toolbar-context.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardDialogService, type ZardDialogRef } from '@/shared/components/dialog';
import type { ZardIcon } from '@/shared/components/icon';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import { AddAccountDialogComponent } from './components/add-account-dialog/add-account-dialog.component';
import {
  UpsertTransferDialogComponent,
  type UpsertTransferDialogData,
} from './components/upsert-transfer-dialog/upsert-transfer-dialog.component';

const ACCOUNT_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'accounts.table.columns.name',
    columnKey: 'name',
    type: 'string',
    sortable: true,
    editableType: 'input',
    inputType: 'text',
    placeholder: 'Account name',
    validation: {
      required: true,
      minLength: 2,
      maxLength: 64,
    },
  },
  {
    columnName: 'accounts.table.columns.description',
    columnKey: 'description',
    type: 'string',
    sortable: true,
    editableType: 'input',
    inputType: 'text',
    placeholder: 'Account description',
    validation: {
      maxLength: 160,
    },
  },
  {
    columnName: 'accounts.table.columns.color',
    columnKey: 'colorKey',
    type: 'string',
    sortable: true,
    editableType: 'select',
    showOptionLabel: true,
    placeholder: 'Select color',
    options: APP_COLOR_OPTIONS,
  },
  {
    columnName: 'accounts.table.columns.icon',
    columnKey: 'icon',
    type: 'string',
    sortable: true,
    editableType: 'combobox',
    showOptionLabel: true,
    placeholder: 'Select icon',
    options: APP_ICON_OPTIONS,
  },
] as const;

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

const APP_ICON_BY_VALUE = new Map(APP_ICON_OPTIONS.map((option) => [option.value, option.icon ?? null] as const));
const APP_COLOR_HEX_BY_VALUE = new Map(APP_COLOR_OPTIONS.map((option) => [option.value, option.colorHex ?? null] as const));

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

const TRANSFER_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'accounts.transfers.table.columns.occurredAt',
    columnKey: 'occurredAt',
    type: 'date',
    sortable: true,
  },
  {
    columnName: 'accounts.transfers.table.columns.fromAccount',
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
    columnName: 'accounts.transfers.table.columns.toAccount',
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
    columnName: 'accounts.transfers.table.columns.amount',
    columnKey: 'amount',
    type: 'currency',
    sortable: true,
  },
] as const;

const createAccountTableStructure = (
  onArchiveAction: (row: object) => void | Promise<void>,
): readonly TableDataItem[] =>
  [
    ...ACCOUNT_TABLE_COLUMNS,
    {
      actionItems: [
        {
          id: 'archive',
          icon: 'archive',
          label: 'accounts.table.actions.archive',
          buttonType: 'ghost',
          disabled: (row: object) => (row as AccountModel).archived,
          action: onArchiveAction,
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
      label: 'accounts.transfers.table.actions.edit',
      buttonType: 'ghost',
      action: onEditTransfer,
    },
    {
      id: 'delete-transfer',
      icon: 'trash',
      label: 'accounts.transfers.table.actions.delete',
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

const sortAccountsById = (accounts: readonly AccountModel[]): readonly AccountModel[] =>
  [...accounts].sort((left, right) => Number(left.id) - Number(right.id));

const sortTransfers = (transfers: readonly TransferModel[]): readonly TransferModel[] =>
  [...transfers].sort(
    (left, right) => Number(right.occurredAt) - Number(left.occurredAt) || right.transferId.localeCompare(left.transferId),
  );

@Component({
  selector: 'app-accounts-page',
  imports: [AppDataTableComponent, ZardSkeletonComponent],
  templateUrl: './accounts-page.html',
})
export class AccountsPage implements OnInit, OnDestroy {
  protected readonly accounts = signal<readonly AccountModel[]>([]);
  protected readonly transfers = signal<readonly TransferModel[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly accountTableStructure = createAccountTableStructure((row) => this.onArchiveAccount(row));
  protected readonly transferTableStructure = computed<readonly TableDataItem[]>(() =>
    createTransferTableStructure(
      (row) => this.onEditTransfer(row),
      (row) => this.onDeleteTransfer(row),
    ),
  );
  protected readonly transferRows = computed<readonly TransferTableRow[]>(() =>
    this.transfers().map((transfer) => this.toTransferRow(transfer)),
  );

  private readonly toolbarActions: readonly ToolbarAction[] = [
    {
      id: 'add-account',
      label: 'accounts.table.actions.add',
      icon: 'plus',
      buttonType: 'default',
      action: () => this.openAddAccountDialog(),
    },
    {
      id: 'add-transfer',
      label: 'accounts.transfers.table.actions.add',
      icon: 'plus',
      buttonType: 'secondary',
      disabled: () => this.transferAccountOptions().length < 2,
      action: () => this.openCreateTransferDialog(),
    },
  ];
  private releaseToolbarActions: (() => void) | null = null;

  private readonly transferAccountOptions = signal<readonly EditableOptionItem[]>([]);
  private readonly accountNameById = signal<ReadonlyMap<number, string>>(new Map());
  private readonly accountIconById = signal<ReadonlyMap<number, ZardIcon | null>>(new Map());
  private readonly accountColorHexById = signal<ReadonlyMap<number, string | null>>(new Map());

  constructor(
    private readonly accountsService: AccountsService,
    private readonly transactionsService: TransactionsService,
    private readonly toolbarContextService: ToolbarContextService,
    private readonly alertDialogService: ZardAlertDialogService,
    private readonly dialogService: ZardDialogService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.accounts',
      actions: this.toolbarActions,
    });
    void this.loadAccountsPageData();
  }

  ngOnDestroy(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
  }

  protected onEditableValueChange(event: EditableValueChangeEvent): void {
    if (!event.valid) {
      return;
    }

    const account = event.row as AccountModel;
    if (account.archived) {
      return;
    }

    const changes = this.toAccountChanges(event.columnKey, event.value);
    if (!changes) {
      return;
    }

    void this.updateAccount(account.id, changes);
  }

  private toAccountChanges(columnKey: string, value: unknown): AccountUpdateDto['changes'] | null {
    switch (columnKey) {
      case 'name': {
        const name = this.toRequiredString(value);
        return name ? { name } : null;
      }
      case 'description':
        return { description: this.toNullableString(value) };
      case 'colorKey':
        return { color_key: this.toNullableColor(value) };
      case 'icon':
        return { icon: this.toNullableIcon(value) };
      default:
        return null;
    }
  }

  private toNullableString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const text = `${value}`.trim();
    return text.length > 0 ? text : null;
  }

  private toRequiredString(value: unknown): string | null {
    const text = this.toNullableString(value);
    return text && text.length > 0 ? text : null;
  }

  private toNullableIcon(value: unknown): string | null {
    const icon = this.toNullableString(value);
    if (!icon) {
      return null;
    }

    return APP_ICON_KEY_SET.has(icon) ? icon : null;
  }

  private toNullableColor(value: unknown): string | null {
    const color = this.toNullableString(value);
    if (!color) {
      return null;
    }

    return APP_COLOR_KEY_SET.has(color) ? color : null;
  }

  private onArchiveAccount(row: object): void {
    const account = row as AccountModel;
    if (account.archived) {
      return;
    }

    this.alertDialogService.confirm({
      zTitle: this.translateService.instant('accounts.archiveAlert.title'),
      zDescription: this.translateService.instant('accounts.archiveAlert.description', {
        name: account.name,
      }),
      zOkText: this.translateService.instant('accounts.archiveAlert.actions.archive'),
      zCancelText: this.translateService.instant('accounts.archiveAlert.actions.cancel'),
      zOkDestructive: true,
      zMaskClosable: true,
      zClosable: true,
      zOnOk: () => {
        void this.archiveAccount(account.id);
      },
    });
  }

  private openAddAccountDialog(): void {
    let isCreatingAccount = false;

    const dialogRef = this.dialogService.create({
      zTitle: this.translateService.instant('accounts.dialog.add.title'),
      zDescription: this.translateService.instant('accounts.dialog.add.description'),
      zContent: AddAccountDialogComponent,
      zWidth: 'min(96vw, 720px)',
      zMaskClosable: true,
      zOkText: this.translateService.instant('accounts.dialog.add.actions.create'),
      zCancelText: this.translateService.instant('accounts.dialog.add.actions.cancel'),
      zOkIcon: 'plus',
      zOnOk: (dialogContent) => {
        if (isCreatingAccount) {
          return false;
        }

        const payload = dialogContent.collectCreatePayload();
        if (!payload) {
          return false;
        }

        isCreatingAccount = true;
        void this
          .createAccount(payload, dialogContent, dialogRef)
          .finally(() => {
            isCreatingAccount = false;
          });
        return false;
      },
    });
  }

  private onEditTransfer(row: object): void {
    const transfer = row as TransferTableRow;
    let isUpdatingTransfer = false;

    const dialogRef = this.dialogService.create<UpsertTransferDialogComponent, UpsertTransferDialogData>({
      zTitle: this.translateService.instant('accounts.transfers.dialog.edit.title'),
      zDescription: this.translateService.instant('accounts.transfers.dialog.edit.description'),
      zContent: UpsertTransferDialogComponent,
      zData: {
        accountOptions: this.transferAccountOptions(),
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
      zOkText: this.translateService.instant('accounts.transfers.dialog.edit.actions.save'),
      zCancelText: this.translateService.instant('accounts.transfers.dialog.edit.actions.cancel'),
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
      zTitle: this.translateService.instant('accounts.transfers.deleteAlert.title'),
      zDescription: this.translateService.instant('accounts.transfers.deleteAlert.description'),
      zOkText: this.translateService.instant('accounts.transfers.deleteAlert.actions.delete'),
      zCancelText: this.translateService.instant('accounts.transfers.deleteAlert.actions.cancel'),
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
      zTitle: this.translateService.instant('accounts.transfers.dialog.add.title'),
      zDescription: this.translateService.instant('accounts.transfers.dialog.add.description'),
      zContent: UpsertTransferDialogComponent,
      zData: {
        accountOptions: this.transferAccountOptions(),
      },
      zWidth: 'min(96vw, 720px)',
      zMaskClosable: true,
      zOkText: this.translateService.instant('accounts.transfers.dialog.add.actions.create'),
      zCancelText: this.translateService.instant('accounts.transfers.dialog.add.actions.cancel'),
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

  private async loadAccountsPageData(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const [accounts, transferRows] = await Promise.all([
        this.accountsService.list({
          where: {
            archived: 0,
          },
          options: {
            orderBy: 'id',
            orderDirection: 'ASC',
          },
        }),
        this.transactionsService.listTransfers(),
      ]);

      this.applyAccountsState(accounts);
      this.transfers.set(TransferModel.fromTransactions(transferRows));
    } catch (error) {
      this.accounts.set([]);
      this.transfers.set([]);
      this.transferAccountOptions.set([]);
      this.accountNameById.set(new Map());
      this.accountIconById.set(new Map());
      this.accountColorHexById.set(new Map());
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading accounts.');
      console.error('[accounts-page] Failed to load account page data:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private applyAccountsState(accounts: readonly AccountModel[]): void {
    const sortedAccounts = sortAccountsById(accounts);
    const accountNameById = new Map(sortedAccounts.map((account) => [account.id, account.name] as const));
    const accountIconById = new Map(
      sortedAccounts.map((account) => [account.id, resolveIconByValue(account.icon)] as const),
    );
    const accountColorHexById = new Map(
      sortedAccounts.map((account) => [account.id, resolveColorHexByValue(account.colorKey)] as const),
    );
    const transferAccountOptions = sortedAccounts.map((account) => ({
      label: account.name,
      value: account.id,
      icon: resolveIconByValue(account.icon) ?? undefined,
      colorHex: resolveColorHexByValue(account.colorKey) ?? undefined,
    }));

    this.accounts.set(sortedAccounts);
    this.accountNameById.set(accountNameById);
    this.accountIconById.set(accountIconById);
    this.accountColorHexById.set(accountColorHexById);
    this.transferAccountOptions.set(transferAccountOptions);
  }

  private async updateAccount(id: number, changes: AccountUpdateDto['changes']): Promise<void> {
    try {
      const result = await this.accountsService.update({ id, changes });

      if (result.row) {
        const nextAccounts = this.accounts().map((row) => (row.id === id ? result.row! : row));
        this.applyAccountsState(nextAccounts);
        return;
      }

      if (result.changed > 0) {
        await this.loadAccountsPageData();
      }
    } catch (error) {
      console.error('[accounts-page] Failed to update account:', error);
      await this.loadAccountsPageData();
    }
  }

  private async archiveAccount(id: number): Promise<void> {
    try {
      const result = await this.accountsService.update({
        id,
        changes: {
          archived: true,
        },
      });

      if ((result.row && result.row.archived) || result.changed > 0) {
        const nextAccounts = this.accounts().filter((row) => row.id !== id);
        this.applyAccountsState(nextAccounts);
        return;
      }

      await this.loadAccountsPageData();
    } catch (error) {
      console.error('[accounts-page] Failed to archive account:', error);
      await this.loadAccountsPageData();
    }
  }

  private async createAccount(
    payload: AccountCreateDto,
    dialogContent: AddAccountDialogComponent,
    dialogRef: ZardDialogRef<AddAccountDialogComponent>,
  ): Promise<void> {
    try {
      const created = await this.accountsService.create(payload);
      if (!created) {
        dialogContent.setSubmitError('accounts.dialog.add.errors.createFailed');
        return;
      }

      this.applyAccountsState([...this.accounts(), created]);
      dialogRef.close(created);
    } catch (error) {
      console.error('[accounts-page] Failed to create account:', error);
      dialogContent.setSubmitError('accounts.dialog.add.errors.createFailed');
    }
  }

  private async createTransfer(
    payload: TransactionCreateTransferDto,
    dialogContent: UpsertTransferDialogComponent,
    dialogRef: ZardDialogRef<UpsertTransferDialogComponent>,
  ): Promise<void> {
    try {
      const created = await this.transactionsService.createTransfer(payload);
      this.upsertTransferRows(created.transactions);
      dialogRef.close(created);
    } catch (error) {
      console.error('[accounts-page] Failed to create transfer:', error);
      dialogContent.setSubmitError('accounts.transfers.dialog.add.errors.createFailed');
    }
  }

  private async updateTransfer(
    payload: TransactionUpdateTransferDto,
    dialogContent: UpsertTransferDialogComponent,
    dialogRef: ZardDialogRef<UpsertTransferDialogComponent>,
  ): Promise<void> {
    try {
      const updated = await this.transactionsService.updateTransfer(payload);
      this.upsertTransferRows(updated.transactions);
      dialogRef.close(updated);
    } catch (error) {
      console.error('[accounts-page] Failed to update transfer:', error);
      dialogContent.setSubmitError('accounts.transfers.dialog.edit.errors.updateFailed');
    }
  }

  private async deleteTransfer(transferId: string): Promise<void> {
    try {
      const result = await this.transactionsService.deleteTransfer({ transfer_id: transferId });
      if (result.changed > 0) {
        this.transfers.update((rows) => rows.filter((row) => row.transferId !== transferId));
        return;
      }

      await this.loadAccountsPageData();
    } catch (error) {
      console.error('[accounts-page] Failed to delete transfer:', error);
      await this.loadAccountsPageData();
    }
  }

  private upsertTransferRows(rows: readonly TransactionModel[]): void {
    const createdTransfers = TransferModel.fromTransactions(rows);
    if (createdTransfers.length === 0) {
      return;
    }

    this.transfers.update((currentRows) => {
      const byTransferId = new Map(currentRows.map((row) => [row.transferId, row] as const));
      for (const transfer of createdTransfers) {
        byTransferId.set(transfer.transferId, transfer);
      }

      return sortTransfers([...byTransferId.values()]);
    });
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
