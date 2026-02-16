import { Component, OnInit, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import {
  APP_COLOR_KEY_SET,
  APP_COLOR_OPTIONS,
  APP_ICON_KEY_SET,
  APP_ICON_OPTIONS,
} from '@/config/visual-options.config';
import {
  AppDataTableComponent,
  type EditableValueChangeEvent,
  type TableHeaderActionItem,
  type TableDataItem,
} from '@/components/data-table';
import type { AccountCreateDto, AccountUpdateDto } from '@/dtos';
import type { AccountModel } from '@/models';
import { AccountsService } from '@/services/accounts.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardDialogService, type ZardDialogRef } from '@/shared/components/dialog';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import { AddAccountDialogComponent } from './add-account-dialog.component';

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

@Component({
  selector: 'app-accounts-page',
  imports: [AppDataTableComponent, ZardSkeletonComponent],
  templateUrl: './accounts-page.html',
})
export class AccountsPage implements OnInit {
  protected readonly accounts = signal<readonly AccountModel[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly accountTableStructure = createAccountTableStructure((row) => this.onArchiveAccount(row));
  protected readonly accountTableActions: readonly TableHeaderActionItem[] = [
    {
      id: 'add-account',
      label: 'accounts.table.actions.add',
      icon: 'plus',
      buttonType: 'default',
      action: () => this.openAddAccountDialog(),
    },
  ];

  constructor(
    private readonly accountsService: AccountsService,
    private readonly alertDialogService: ZardAlertDialogService,
    private readonly dialogService: ZardDialogService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    void this.loadAccounts();
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

  private async loadAccounts(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const accounts = await this.accountsService.list({
        where: {
          archived: 0,
        },
        options: {
          orderBy: 'id',
          orderDirection: 'ASC',
        },
      });
      this.accounts.set(accounts);
    } catch (error) {
      this.accounts.set([]);
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading accounts.');
      console.error('[accounts-page] Failed to list accounts:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async updateAccount(id: number, changes: AccountUpdateDto['changes']): Promise<void> {
    try {
      const result = await this.accountsService.update({ id, changes });

      if (result.row) {
        this.accounts.update((rows) => rows.map((row) => (row.id === id ? result.row! : row)));
        return;
      }

      if (result.changed > 0) {
        await this.loadAccounts();
      }
    } catch (error) {
      console.error('[accounts-page] Failed to update account:', error);
      await this.loadAccounts();
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
        this.accounts.update((rows) => rows.filter((row) => row.id !== id));
        return;
      }

      await this.loadAccounts();
    } catch (error) {
      console.error('[accounts-page] Failed to archive account:', error);
      await this.loadAccounts();
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

      this.accounts.update((rows) =>
        [...rows, created].sort((left, right) => Number(left.id) - Number(right.id)),
      );
      dialogRef.close(created);
    } catch (error) {
      console.error('[accounts-page] Failed to create account:', error);
      dialogContent.setSubmitError('accounts.dialog.add.errors.createFailed');
    }
  }
}
