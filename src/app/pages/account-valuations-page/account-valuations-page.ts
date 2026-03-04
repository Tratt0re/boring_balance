import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, ViewEncapsulation, computed, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { AppBaseCardComponent } from '@/components/base-card';
import { AppLineChartComponent, type AppLineChartSeries } from '@/components/charts';
import { AppDataTableComponent, type TableDataItem } from '@/components/data-table';
import { DEFAULT_VISUAL_COLOR_KEY, DEFAULT_VISUAL_ICON_KEY } from '@/config/visual-options.config';
import type { AccountValuationCreateDto, AccountValuationUpdateDto } from '@/dtos';
import { AccountValuationModel } from '@/models';
import { AccountValuationsService } from '@/services/account-valuations.service';
import { AccountsService } from '@/services/accounts.service';
import { AnalyticsService } from '@/services/analytics.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { NumberFormatService } from '@/services/number-format.service';
import { ToolbarContextService, type ToolbarAction } from '@/services/toolbar-context.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardDialogService, type ZardDialogRef } from '@/shared/components/dialog';
import { ZardIconComponent, type ZardIcon } from '@/shared/components/icon';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import {
  UpsertAccountValuationDialogComponent,
  type UpsertAccountValuationDialogData,
} from './components/upsert-account-valuation-dialog/upsert-account-valuation-dialog.component';

const AMOUNT_CENTS_DIVISOR = 100;

interface ValuationTableRow {
  readonly id: number;
  readonly valuedAt: number;
  readonly dateFormatted: string;
  readonly valueCents: number;
  readonly valueFormatted: string;
  readonly deltaFormatted: string;
  readonly deltaCents: number | null;
}

const VALUATION_COLUMN_WIDTH = {
  date: '3/10',
  value: '3/10',
  change: '3/10',
  action: '1/10',
} as const;

const VALUATION_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'accountValuations.table.columns.date',
    columnKey: 'dateFormatted',
    type: 'string',
    sortable: false,
    minWidth: VALUATION_COLUMN_WIDTH.date,
    maxWidth: VALUATION_COLUMN_WIDTH.date,
  },
  {
    columnName: 'accountValuations.table.columns.value',
    columnKey: 'valueFormatted',
    type: 'string',
    sortable: false,
    minWidth: VALUATION_COLUMN_WIDTH.value,
    maxWidth: VALUATION_COLUMN_WIDTH.value,
  },
  {
    columnName: 'accountValuations.table.columns.change',
    columnKey: 'deltaFormatted',
    type: 'string',
    sortable: false,
    minWidth: VALUATION_COLUMN_WIDTH.change,
    maxWidth: VALUATION_COLUMN_WIDTH.change,
  },
] as const;

const createValuationTableStructure = (
  onEditAction: (row: object) => void | Promise<void>,
  onDeleteAction: (row: object) => void | Promise<void>,
): readonly TableDataItem[] =>
  [
    ...VALUATION_TABLE_COLUMNS,
    {
      minWidth: VALUATION_COLUMN_WIDTH.action,
      maxWidth: VALUATION_COLUMN_WIDTH.action,
      showLabel: false,
      actionItems: [
        {
          id: 'edit',
          icon: 'pencil',
          label: 'accountValuations.table.actions.edit',
          buttonType: 'ghost',
          action: onEditAction,
        },
        {
          id: 'delete',
          icon: 'trash',
          label: 'accountValuations.table.actions.delete',
          buttonType: 'ghost',
          action: onDeleteAction,
        },
      ],
    },
  ] as const;

@Component({
  selector: 'app-account-valuations-page',
  imports: [
    AppBaseCardComponent,
    AppLineChartComponent,
    AppDataTableComponent,
    TranslatePipe,
    ZardIconComponent,
    ZardSkeletonComponent,
  ],
  providers: [DatePipe],
  templateUrl: './account-valuations-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class AccountValuationsPage implements OnInit, OnDestroy {
  protected readonly accountName = signal<string | null>(null);
  protected readonly accountIcon = signal<ZardIcon>(DEFAULT_VISUAL_ICON_KEY as ZardIcon);
  protected readonly accountColorKey = signal<string>(DEFAULT_VISUAL_COLOR_KEY);
  protected readonly accountIconColorHex = computed(() => `var(--${this.accountColorKey()})`);

  protected readonly valuations = signal<readonly ValuationTableRow[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly transactionBalanceCents = signal<number | null>(null);
  protected readonly latestValueCents = signal<number | null>(null);
  protected readonly deltaCents = signal<number | null>(null);
  protected readonly deltaPct = signal<number | null>(null);

  protected readonly currencyCode = computed(() => this.localPreferencesService.currencyPreference());

  protected readonly chartLabels = computed<readonly string[]>(() =>
    this.valuations().map((v) => v.dateFormatted),
  );

  protected readonly chartSeries = computed<readonly AppLineChartSeries[]>(() => {
    const rows = this.valuations();
    if (rows.length < 2) {
      return [];
    }

    return [
      {
        name: this.translateService.instant('accountValuations.chart.seriesName'),
        data: rows.map((v) => this.toAmount(v.valueCents)),
        color: 'var(--chart-income)',
        smooth: true,
        showArea: true,
        areaOpacity: 0.15,
      },
    ];
  });

  protected readonly hasData = computed(() => this.valuations().length > 0);
  protected readonly hasChartData = computed(() => this.valuations().length >= 2);
  protected readonly valuationTableStructure = createValuationTableStructure(
    (row) => this.onEditValuation(row),
    (row) => this.onDeleteValuation(row),
  );

  private accountId: number | null = null;
  private releaseToolbarActions: (() => void) | null = null;

  private readonly toolbarActions: readonly ToolbarAction[] = [
    {
      id: 'add-valuation',
      label: 'accountValuations.table.actions.add',
      icon: 'plus',
      buttonType: 'default',
      action: () => this.openAddValuationDialog(),
    },
  ];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly accountsService: AccountsService,
    private readonly accountValuationsService: AccountValuationsService,
    private readonly analyticsService: AnalyticsService,
    private readonly localPreferencesService: LocalPreferencesService,
    private readonly numberFormatService: NumberFormatService,
    private readonly toolbarContextService: ToolbarContextService,
    private readonly alertDialogService: ZardAlertDialogService,
    private readonly dialogService: ZardDialogService,
    private readonly translateService: TranslateService,
    private readonly datePipe: DatePipe,
  ) {}

  ngOnInit(): void {
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'accountValuations.page.title',
      titleMode: 'breadcrumb',
      titleBreadcrumbs: [
        { label: 'nav.items.accounts', path: '/accounts' },
        { label: 'accountValuations.page.title' },
      ],
      itemActions: this.toolbarActions,
    });

    const paramId = this.route.snapshot.paramMap.get('accountId');
    const parsedId = paramId ? Number.parseInt(paramId, 10) : NaN;

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      this.isLoading.set(false);
      this.loadError.set('Invalid account ID.');
      return;
    }

    this.accountId = parsedId;
    void this.loadPageData(parsedId);
  }

  ngOnDestroy(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
  }

  private async loadPageData(accountId: number): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const [account, netWorthResponse, listResult] = await Promise.all([
        this.accountsService.get({ id: accountId }),
        this.analyticsService.netWorthByAccount({ account_ids: [accountId] }),
        this.accountValuationsService.list({
          where: { account_id: accountId },
          all: true,
          options: { orderBy: 'valued_at', orderDirection: 'ASC' },
        }),
      ]);

      if (account) {
        this.accountName.set(account.name);
        this.accountIcon.set((account.icon ?? DEFAULT_VISUAL_ICON_KEY) as ZardIcon);
        this.accountColorKey.set(account.colorKey ?? DEFAULT_VISUAL_COLOR_KEY);
      }

      const accountNetWorthRow = netWorthResponse.rows.find((r) => r.account_id === accountId);
      this.transactionBalanceCents.set(accountNetWorthRow?.net_worth_cents ?? 0);

      const sortedRows = [...listResult.rows].sort((a, b) => a.valuedAt - b.valuedAt);
      this.applyValuations(sortedRows);
    } catch (error) {
      this.valuations.set([]);
      this.transactionBalanceCents.set(null);
      this.latestValueCents.set(null);
      this.deltaCents.set(null);
      this.deltaPct.set(null);
      this.loadError.set(
        error instanceof Error ? error.message : 'Unexpected error while loading valuations.',
      );
      console.error('[account-valuations-page] Failed to load page data:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private applyValuations(sortedRows: readonly AccountValuationModel[]): void {
    const txBalanceCents = this.transactionBalanceCents();

    const tableRows: ValuationTableRow[] = sortedRows.map((row) => {
      const deltaCents = txBalanceCents !== null ? row.valueCents - txBalanceCents : null;

      return {
        id: row.id,
        valuedAt: row.valuedAt,
        dateFormatted: this.formatDate(row.valuedAt),
        valueCents: row.valueCents,
        valueFormatted: this.formatCurrency(this.toAmount(row.valueCents)),
        deltaFormatted: this.formatDeltaString(deltaCents, txBalanceCents),
        deltaCents,
      };
    });

    this.valuations.set(tableRows);

    const latest = sortedRows[sortedRows.length - 1] ?? null;
    this.latestValueCents.set(latest?.valueCents ?? null);

    if (latest !== null && txBalanceCents !== null) {
      const delta = latest.valueCents - txBalanceCents;
      this.deltaCents.set(delta);
      this.deltaPct.set(txBalanceCents !== 0 ? (delta / txBalanceCents) * 100 : null);
    } else {
      this.deltaCents.set(null);
      this.deltaPct.set(null);
    }
  }

  protected formatCurrency(amount: number): string {
    return this.numberFormatService.formatCurrency(amount, this.currencyCode());
  }

  protected formatSignedCurrency(amount: number): string {
    const sign = amount > 0 ? '+' : '';
    return `${sign}${this.formatCurrency(amount)}`;
  }

  protected formatPercent(value: number): string {
    const sign = value > 0 ? '+' : '';
    return `${sign}${this.numberFormatService.formatPercent(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  protected transactionBalanceAmount(): number {
    return this.toAmount(this.transactionBalanceCents() ?? 0);
  }

  protected latestValueAmount(): number {
    return this.toAmount(this.latestValueCents() ?? 0);
  }

  protected deltaAmount(): number {
    return this.toAmount(this.deltaCents() ?? 0);
  }

  private formatDeltaString(deltaCents: number | null, referenceCents: number | null): string {
    if (deltaCents === null) {
      return '—';
    }

    const deltaAmount = this.toAmount(deltaCents);
    const signed = this.formatSignedCurrency(deltaAmount);

    if (referenceCents !== null && referenceCents !== 0) {
      const pct = (deltaCents / referenceCents) * 100;
      return `${signed} (${this.formatPercent(pct)})`;
    }

    return signed;
  }

  private formatDate(unixMs: number): string {
    return this.datePipe.transform(new Date(unixMs), 'MMM d, yyyy') ?? '';
  }

  private toAmount(cents: number): number {
    return cents / AMOUNT_CENTS_DIVISOR;
  }

  private onEditValuation(row: object): void {
    const valuation = row as ValuationTableRow;
    let isUpdating = false;

    const dialogRef = this.dialogService.create<
      UpsertAccountValuationDialogComponent,
      UpsertAccountValuationDialogData
    >({
      zTitle: this.translateService.instant('accountValuations.dialog.edit.title'),
      zDescription: this.translateService.instant('accountValuations.dialog.edit.description'),
      zContent: UpsertAccountValuationDialogComponent,
      zData: {
        accountId: this.accountId!,
        valuation: {
          valuedAt: valuation.valuedAt,
          valueCents: valuation.valueCents,
        },
      },
      zWidth: 'min(96vw, 720px)',
      zMaskClosable: true,
      zOkText: this.translateService.instant('accountValuations.dialog.edit.actions.save'),
      zCancelText: this.translateService.instant('accountValuations.dialog.edit.actions.cancel'),
      zOkIcon: 'pencil',
      zOnOk: (dialogContent) => {
        if (isUpdating) {
          return false;
        }

        const changes = dialogContent.collectUpdateChanges();
        if (!changes) {
          return false;
        }

        isUpdating = true;
        void this
          .updateValuationFromDialog(valuation.id, changes, dialogContent, dialogRef)
          .finally(() => {
            isUpdating = false;
          });
        return false;
      },
    });
  }

  private onDeleteValuation(row: object): void {
    const valuation = row as ValuationTableRow;

    this.alertDialogService.confirm({
      zTitle: this.translateService.instant('accountValuations.deleteAlert.title'),
      zDescription: this.translateService.instant('accountValuations.deleteAlert.description'),
      zOkText: this.translateService.instant('accountValuations.deleteAlert.actions.delete'),
      zCancelText: this.translateService.instant('accountValuations.deleteAlert.actions.cancel'),
      zOkDestructive: true,
      zMaskClosable: true,
      zClosable: true,
      zOnOk: () => {
        void this.deleteValuation(valuation.id);
      },
    });
  }

  private openAddValuationDialog(): void {
    let isCreating = false;

    const dialogRef = this.dialogService.create<
      UpsertAccountValuationDialogComponent,
      UpsertAccountValuationDialogData
    >({
      zTitle: this.translateService.instant('accountValuations.dialog.add.title'),
      zDescription: this.translateService.instant('accountValuations.dialog.add.description'),
      zContent: UpsertAccountValuationDialogComponent,
      zData: {
        accountId: this.accountId!,
      },
      zWidth: 'min(96vw, 720px)',
      zMaskClosable: true,
      zOkText: this.translateService.instant('accountValuations.dialog.add.actions.create'),
      zCancelText: this.translateService.instant('accountValuations.dialog.add.actions.cancel'),
      zOkIcon: 'plus',
      zOnOk: (dialogContent) => {
        if (isCreating) {
          return false;
        }

        const payload = dialogContent.collectCreatePayload();
        if (!payload) {
          return false;
        }

        isCreating = true;
        void this
          .createValuationFromDialog(payload, dialogContent, dialogRef)
          .finally(() => {
            isCreating = false;
          });
        return false;
      },
    });
  }

  private async updateValuationFromDialog(
    id: number,
    changes: AccountValuationUpdateDto['changes'],
    dialogContent: UpsertAccountValuationDialogComponent,
    dialogRef: ZardDialogRef<UpsertAccountValuationDialogComponent>,
  ): Promise<void> {
    try {
      const result = await this.accountValuationsService.update({ id, changes });

      if (result.changed > 0) {
        dialogRef.close(result.row);
        toast.success(this.translateService.instant('accountValuations.toasts.updateSuccess'));
        await this.reloadValuations();
        return;
      }

      dialogContent.setSubmitError('accountValuations.dialog.edit.errors.updateFailed');
    } catch (error) {
      console.error('[account-valuations-page] Failed to update valuation:', error);
      dialogContent.setSubmitError('accountValuations.dialog.edit.errors.updateFailed');
    }
  }

  private async createValuationFromDialog(
    payload: AccountValuationCreateDto,
    dialogContent: UpsertAccountValuationDialogComponent,
    dialogRef: ZardDialogRef<UpsertAccountValuationDialogComponent>,
  ): Promise<void> {
    try {
      const created = await this.accountValuationsService.create(payload);
      if (!created) {
        dialogContent.setSubmitError('accountValuations.dialog.add.errors.createFailed');
        return;
      }

      dialogRef.close(created);
      toast.success(this.translateService.instant('accountValuations.toasts.createSuccess'));
      await this.reloadValuations();
    } catch (error) {
      console.error('[account-valuations-page] Failed to create valuation:', error);
      dialogContent.setSubmitError('accountValuations.dialog.add.errors.createFailed');
    }
  }

  private async deleteValuation(id: number): Promise<void> {
    try {
      const result = await this.accountValuationsService.remove({ id });
      if (result.changed > 0) {
        toast.success(this.translateService.instant('accountValuations.toasts.deleteSuccess'));
        await this.reloadValuations();
        return;
      }

      await this.reloadValuations();
    } catch (error) {
      console.error('[account-valuations-page] Failed to delete valuation:', error);
      toast.error(this.translateService.instant('accountValuations.toasts.deleteError'));
      await this.reloadValuations();
    }
  }

  private async reloadValuations(): Promise<void> {
    if (!this.accountId) {
      return;
    }

    try {
      const listResult = await this.accountValuationsService.list({
        where: { account_id: this.accountId },
        all: true,
        options: { orderBy: 'valued_at', orderDirection: 'ASC' },
      });

      const sortedRows = [...listResult.rows].sort((a, b) => a.valuedAt - b.valuedAt);
      this.applyValuations(sortedRows);
    } catch (error) {
      console.error('[account-valuations-page] Failed to reload valuations:', error);
    }
  }
}
