import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { AppDataTableComponent, type TableDataItem } from '@/components/data-table';
import {
  DEFAULT_VISUAL_COLOR_KEY,
  DEFAULT_VISUAL_ICON_KEY,
} from '@/config/visual-options.config';
import type { AccountModel } from '@/models';
import { AccountsService } from '@/services/accounts.service';
import { Z_MODAL_DATA } from '@/shared/components/dialog';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import { createActionColumn } from '@/shared/utils';

export interface ManageArchivedAccountsDialogData {
  readonly onAccountUnarchived: () => void | Promise<void>;
}

interface ArchivedAccountTableRow {
  readonly id: number;
  readonly name: string;
  readonly typeLabel: string;
  readonly description: string | null;
  readonly icon: string | null;
  readonly iconColorHex: string;
}

const ARCHIVED_ACCOUNT_COLUMN_WIDTH = {
  name: '3/10',
  type: '2/10',
  description: '4/10',
  action: '1/10',
} as const;

const ARCHIVED_ACCOUNT_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'common.labels.name',
    columnKey: 'name',
    type: 'string',
    sortable: true,
    minWidth: ARCHIVED_ACCOUNT_COLUMN_WIDTH.name,
    maxWidth: ARCHIVED_ACCOUNT_COLUMN_WIDTH.name,
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
    minWidth: ARCHIVED_ACCOUNT_COLUMN_WIDTH.type,
    maxWidth: ARCHIVED_ACCOUNT_COLUMN_WIDTH.type,
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
    minWidth: ARCHIVED_ACCOUNT_COLUMN_WIDTH.description,
    maxWidth: ARCHIVED_ACCOUNT_COLUMN_WIDTH.description,
  },
] as const;

const createArchivedAccountTableStructure = (
  onUnarchiveAction: (row: object) => void | Promise<void>,
  isActionDisabled: () => boolean,
): readonly TableDataItem[] =>
  [
    ...ARCHIVED_ACCOUNT_TABLE_COLUMNS,
    createActionColumn(ARCHIVED_ACCOUNT_COLUMN_WIDTH.action, [
      {
        id: 'unarchive-account',
        icon: 'arrow-left',
        label: 'accounts.archivedDialog.actions.unarchive',
        buttonType: 'ghost',
        disabled: isActionDisabled,
        action: onUnarchiveAction,
      },
    ]),
  ] as const;

@Component({
  selector: 'app-manage-archived-accounts-dialog',
  imports: [AppDataTableComponent, TranslatePipe, ZardSkeletonComponent],
  templateUrl: './manage-archived-accounts-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageArchivedAccountsDialogComponent implements OnInit {
  private readonly accountsService = inject(AccountsService);
  private readonly data = inject<ManageArchivedAccountsDialogData>(Z_MODAL_DATA);
  private readonly translateService = inject(TranslateService);

  protected readonly accounts = signal<readonly ArchivedAccountTableRow[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly unarchivingAccountId = signal<number | null>(null);
  protected readonly tableStructure = createArchivedAccountTableStructure(
    (row) => this.onUnarchiveAccount(row),
    () => this.unarchivingAccountId() !== null,
  );

  ngOnInit(): void {
    void this.loadArchivedAccounts();
  }

  private toArchivedAccountTableRow(account: AccountModel): ArchivedAccountTableRow {
    return {
      id: account.id,
      name: account.name,
      typeLabel: `account.type.${account.type}`,
      description: account.description,
      icon: account.icon,
      iconColorHex: `var(--${account.colorKey ?? DEFAULT_VISUAL_COLOR_KEY})`,
    };
  }

  private onUnarchiveAccount(row: object): void {
    if (this.unarchivingAccountId() !== null) {
      return;
    }

    const account = row as ArchivedAccountTableRow;
    void this.unarchiveAccount(account.id);
  }

  private async loadArchivedAccounts(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const accounts = await this.accountsService.listAll({
        where: {
          archived: 1,
        },
        options: {
          orderBy: 'id',
          orderDirection: 'ASC',
        },
      });

      this.accounts.set(accounts.map((account) => this.toArchivedAccountTableRow(account)));
    } catch (error) {
      this.accounts.set([]);
      this.loadError.set(
        error instanceof Error ? error.message : 'Unexpected error while loading archived accounts.',
      );
      console.error('[manage-archived-accounts-dialog] Failed to load archived accounts:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async unarchiveAccount(id: number): Promise<void> {
    this.unarchivingAccountId.set(id);

    try {
      const result = await this.accountsService.update({
        id,
        changes: {
          archived: false,
        },
      });

      if ((result.row && !result.row.archived) || result.changed > 0) {
        this.accounts.update((rows) => rows.filter((row) => row.id !== id));
        await this.data.onAccountUnarchived();
        toast.success(this.translateService.instant('accounts.toasts.unarchiveSuccess'));
        return;
      }

      await this.loadArchivedAccounts();
      toast.error(this.translateService.instant('accounts.toasts.unarchiveError'));
    } catch (error) {
      console.error('[manage-archived-accounts-dialog] Failed to unarchive account:', error);
      toast.error(this.translateService.instant('accounts.toasts.unarchiveError'));
      await this.loadArchivedAccounts();
    } finally {
      this.unarchivingAccountId.set(null);
    }
  }
}
