import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AppDataTableComponent, type TableDataItem } from '@/components/data-table';
import {
  DEFAULT_VISUAL_COLOR_KEY,
  DEFAULT_VISUAL_ICON_KEY,
} from '@/config/visual-options.config';
import type { AccountCreateDto, AccountUpdateDto } from '@/dtos';
import { AccountModel } from '@/models';
import { AccountsService } from '@/services/accounts.service';
import { ToolbarContextService, type ToolbarAction } from '@/services/toolbar-context.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardDialogService, type ZardDialogRef } from '@/shared/components/dialog';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import {
  UpsertAccountDialogComponent,
  type UpsertAccountDialogData,
} from './components/upsert-account-dialog/upsert-account-dialog.component';

const isAccountReadonly = (row: object): boolean => {
  const account = row as AccountTableRow;
  return account.locked || account.archived;
};

const isValuationAccount = (row: object): boolean => {
  const account = row as AccountTableRow;
  return account.type === 'brokerage' || account.type === 'crypto';
};

interface AccountTableRow {
  readonly id: number;
  readonly name: string;
  readonly type: AccountModel['type'];
  readonly typeLabel: string;
  readonly description: string | null;
  readonly colorKey: string | null;
  readonly icon: string | null;
  readonly iconColorHex: string | null;
  readonly locked: boolean;
  readonly archived: boolean;
}

const ACCOUNT_COLUMN_WIDTH = {
  name: '2/10',
  type: '1/10',
  description: '5/10',
  action: '2/10',
} as const;

const ACCOUNT_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'common.labels.name',
    columnKey: 'name',
    type: 'string',
    sortable: true,
    minWidth: ACCOUNT_COLUMN_WIDTH.name,
    maxWidth: ACCOUNT_COLUMN_WIDTH.name,
    cellIcon: {
      icon: DEFAULT_VISUAL_ICON_KEY,
      iconColumnKey: 'icon',
      colorHex: `var(--${DEFAULT_VISUAL_COLOR_KEY})`,
      colorHexColumnKey: 'iconColorHex',
    },
  },
  {
    columnName: 'common.labels.type',
    columnKey: 'typeLabel',
    type: 'badge',
    sortable: true,
    minWidth: ACCOUNT_COLUMN_WIDTH.type,
    maxWidth: ACCOUNT_COLUMN_WIDTH.type,
    badge: {
      shape: 'pill',
      type: 'secondary',
    },
  },
  {
    columnName: 'common.labels.description',
    columnKey: 'description',
    type: 'string',
    sortable: true,
    minWidth: ACCOUNT_COLUMN_WIDTH.description,
    maxWidth: ACCOUNT_COLUMN_WIDTH.description,
  },
] as const;

const createAccountTableStructure = (
  onEditAction: (row: object) => void | Promise<void>,
  onArchiveAction: (row: object) => void | Promise<void>,
  onViewValuationsAction: (row: object) => void | Promise<void>,
): readonly TableDataItem[] =>
  [
    ...ACCOUNT_TABLE_COLUMNS,
    {
      minWidth: ACCOUNT_COLUMN_WIDTH.action,
      maxWidth: ACCOUNT_COLUMN_WIDTH.action,
      showLabel: false,
      actionItems: [
        {
          id: 'view-valuations',
          icon: 'chart-line',
          label: 'accountValuations.table.actions.viewHistory',
          buttonType: 'ghost',
          visible: isValuationAccount,
          action: onViewValuationsAction,
        },
        {
          id: 'edit',
          icon: 'pencil',
          label: 'accounts.table.actions.edit',
          buttonType: 'ghost',
          disabled: isAccountReadonly,
          action: onEditAction,
        },
        {
          id: 'archive',
          icon: 'archive',
          label: 'accounts.table.actions.archive',
          buttonType: 'ghost',
          disabled: isAccountReadonly,
          action: onArchiveAction,
        },
        {
          id: 'readonly-lock',
          icon: 'lock',
          label: 'accounts.table.actions.locked',
          buttonType: 'ghost',
          visible: isAccountReadonly,
          disabled: () => true,
          showWhenDisabled: true,
          action: () => undefined,
        },
      ],
    },
  ] as const;

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;

@Component({
  selector: 'app-accounts-page',
  imports: [AppDataTableComponent, TranslatePipe, ZardSkeletonComponent],
  templateUrl: './accounts-page.html',
})
export class AccountsPage implements OnInit, OnDestroy {
  protected readonly accounts = signal<readonly AccountTableRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly accountRowClass = (row: object): string =>
    isAccountReadonly(row) ? 'bg-primary-foreground' : '';
  protected readonly accountTableStructure = createAccountTableStructure(
    (row) => this.onEditAccount(row),
    (row) => this.onArchiveAccount(row),
    (row) => this.onViewValuations(row),
  );

  private readonly toolbarActions: readonly ToolbarAction[] = [
    {
      id: 'add-account',
      label: 'accounts.table.actions.add',
      icon: 'plus',
      buttonType: 'default',
      action: () => this.openAddAccountDialog(),
    },
  ];

  private releaseToolbarActions: (() => void) | null = null;

  constructor(
    private readonly router: Router,
    private readonly accountsService: AccountsService,
    private readonly toolbarContextService: ToolbarContextService,
    private readonly alertDialogService: ZardAlertDialogService,
    private readonly dialogService: ZardDialogService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.accounts',
      itemActions: this.toolbarActions,
    });
    void this.loadAccounts();
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
    void this.loadAccounts(nextPage);
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
    void this.loadAccounts(1);
  }

  private toAccountTableRow(account: AccountModel): AccountTableRow {
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      typeLabel: `account.type.${account.type}`,
      description: account.description,
      colorKey: account.colorKey,
      icon: account.icon,
      iconColorHex: `var(--${account.colorKey ?? DEFAULT_VISUAL_COLOR_KEY})`,
      locked: account.locked,
      archived: account.archived,
    };
  }

  private onViewValuations(row: object): void {
    const account = row as AccountTableRow;
    void this.router.navigate(['/account-valuations', account.id]);
  }

  private onEditAccount(row: object): void {
    const account = row as AccountTableRow;
    if (isAccountReadonly(account)) {
      return;
    }

    let isUpdatingAccount = false;

    const dialogRef = this.dialogService.create<UpsertAccountDialogComponent, UpsertAccountDialogData>({
      zTitle: this.translateService.instant('accounts.dialog.edit.title'),
      zDescription: this.translateService.instant('accounts.dialog.edit.description'),
      zContent: UpsertAccountDialogComponent,
      zData: {
        account: {
          name: account.name,
          type: account.type,
          description: account.description,
          colorKey: account.colorKey,
          icon: account.icon,
        },
      },
      zWidth: 'min(96vw, 720px)',
      zMaskClosable: true,
      zOkText: this.translateService.instant('accounts.dialog.edit.actions.save'),
      zCancelText: this.translateService.instant('accounts.dialog.edit.actions.cancel'),
      zOkIcon: 'pencil',
      zOnOk: (dialogContent) => {
        if (isUpdatingAccount) {
          return false;
        }

        const changes = dialogContent.collectUpdateChanges();
        if (!changes) {
          return false;
        }

        isUpdatingAccount = true;
        void this
          .updateAccountFromDialog(account.id, changes, dialogContent, dialogRef)
          .finally(() => {
            isUpdatingAccount = false;
          });
        return false;
      },
    });
  }

  private onArchiveAccount(row: object): void {
    const account = row as AccountTableRow;
    if (isAccountReadonly(account)) {
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
      zContent: UpsertAccountDialogComponent,
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

  private async loadAccounts(page = this.page()): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const response = await this.accountsService.list({
        where: {
          archived: 0,
        },
        page,
        page_size: this.pageSize(),
        options: {
          orderBy: 'id',
          orderDirection: 'ASC',
        },
      });

      this.accounts.set(response.rows.map((account) => this.toAccountTableRow(account)));
      this.total.set(response.total);
      this.page.set(response.page);
    } catch (error) {
      this.accounts.set([]);
      this.total.set(0);
      this.page.set(1);
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading accounts.');
      console.error('[accounts-page] Failed to load accounts:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async updateAccountFromDialog(
    id: number,
    changes: AccountUpdateDto['changes'],
    dialogContent: UpsertAccountDialogComponent,
    dialogRef: ZardDialogRef<UpsertAccountDialogComponent>,
  ): Promise<void> {
    try {
      const result = await this.accountsService.update({ id, changes });

      if (result.row) {
        const nextAccounts = this.accounts().map((row) => (row.id === id ? this.toAccountTableRow(result.row!) : row));
        this.accounts.set(nextAccounts);
        dialogRef.close(result.row);
        return;
      }

      if (result.changed > 0) {
        await this.loadAccounts();
        dialogRef.close(null);
        return;
      }

      dialogContent.setSubmitError('accounts.dialog.edit.errors.updateFailed');
    } catch (error) {
      console.error('[accounts-page] Failed to update account:', error);
      dialogContent.setSubmitError('accounts.dialog.edit.errors.updateFailed');
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
        await this.loadAccounts();
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
    dialogContent: UpsertAccountDialogComponent,
    dialogRef: ZardDialogRef<UpsertAccountDialogComponent>,
  ): Promise<void> {
    try {
      const created = await this.accountsService.create(payload);
      if (!created) {
        dialogContent.setSubmitError('accounts.dialog.add.errors.createFailed');
        return;
      }

      const nextTotal = this.total() + 1;
      const targetPage = Math.max(1, Math.ceil(nextTotal / this.pageSize()));
      this.page.set(targetPage);
      await this.loadAccounts(targetPage);
      dialogRef.close(created);
    } catch (error) {
      console.error('[accounts-page] Failed to create account:', error);
      dialogContent.setSubmitError('accounts.dialog.add.errors.createFailed');
    }
  }
}
