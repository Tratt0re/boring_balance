import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { AppBaseCardComponent } from '@/components/base-card';
import {
  AppBarChartComponent,
  AppSankeyChartComponent,
  resolveChartCssColor,
  type AppBarChartSeries,
  type AppSankeyChartLink,
  type AppSankeyChartNode,
} from '@/components/charts';
import { DEFAULT_VISUAL_COLOR_KEY } from '@/config/visual-options.config';
import { AccountsService } from '@/services/accounts.service';
import { AppTransactionListCardComponent } from '@/components/transaction-list-card';
import { AnalyticsService } from '@/services/analytics.service';
import { CategoriesService } from '@/services/categories.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { ToolbarContextService, type ToolbarAction } from '@/services/toolbar-context.service';
import { type ZardIcon, ZardIconComponent } from '@/shared/components/icon';
import { ZardLoaderComponent } from '@/shared/components/loader';
import { detectSmallScreenViewport } from '@/shared/utils';

const AMOUNT_CENTS_DIVISOR = 100;
const NET_WORTH_PIE_OTHERS_THRESHOLD = 0.1;
const NET_WORTH_DISTRIBUTION_BAR_HEIGHT_DESKTOP = '15rem';
const NET_WORTH_DISTRIBUTION_BAR_HEIGHT_MOBILE = '20rem';
const MONTHLY_TOTALS_BAR_CHART_HEIGHT_DESKTOP = '15rem';
const MONTHLY_TOTALS_BAR_CHART_HEIGHT_MOBILE = '18rem';
const MONEY_FLOW_SANKEY_CHART_HEIGHT_DESKTOP = '16rem';
const MONEY_FLOW_SANKEY_CHART_HEIGHT_MOBILE = '18rem';
const MONEY_FLOW_EXPENSE_CATEGORY_GROUP_THRESHOLD = 0.1;

function formatMonthLabel(monthKey: string, locale?: string): string {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number.parseInt(yearText ?? '', 10);
  const month = Number.parseInt(monthText ?? '', 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return monthKey;
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: '2-digit',
  }).format(new Date(year, month - 1, 1));
}

function toAmount(amountCents: number): number {
  return amountCents / AMOUNT_CENTS_DIVISOR;
}

function toPercent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return (part / total) * 100;
}

function toAbsoluteAmount(amountCents: number): number {
  return Math.abs(amountCents) / AMOUNT_CENTS_DIVISOR;
}

function toMonthRangeTimestamps(year: number, monthIndex: number): { from: number; to: number } {
  const from = new Date(year, monthIndex, 1, 0, 0, 0, 0).getTime();
  const to = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999).getTime();
  return { from, to };
}

function toYearRangeTimestamps(year: number): { from: number; to: number } {
  const from = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
  const to = new Date(year, 11, 31, 23, 59, 59, 999).getTime();
  return { from, to };
}

function resolveVisualColorHex(colorKey: string | null | undefined): string {
  const fallbackColor = resolveChartCssColor(`--${DEFAULT_VISUAL_COLOR_KEY}`, '#9ca3af');
  if (typeof colorKey !== 'string' || colorKey.trim().length === 0) {
    return fallbackColor;
  }

  return resolveChartCssColor(`--${colorKey}`, fallbackColor);
}

function allocateBucketsToTargetTotalCents<TBucket extends { readonly totalCents: number }>(
  buckets: readonly TBucket[],
  targetTotalCents: number,
): Array<TBucket & { totalCents: number }> {
  const normalizedTarget = Math.max(0, Math.round(Number(targetTotalCents)));
  if (normalizedTarget <= 0 || buckets.length === 0) {
    return [];
  }

  const positiveBuckets = buckets.filter((bucket) => Number(bucket.totalCents) > 0);
  if (positiveBuckets.length === 0) {
    return [];
  }

  const rawTotal = positiveBuckets.reduce((sum, bucket) => sum + Math.max(0, Number(bucket.totalCents)), 0);
  if (rawTotal <= 0) {
    return [];
  }

  const allocations = positiveBuckets.map((bucket, index) => {
    const rawValue = Math.max(0, Number(bucket.totalCents));
    const scaledValue = (rawValue * normalizedTarget) / rawTotal;
    const flooredValue = Math.floor(scaledValue);

    return {
      bucket,
      index,
      totalCents: flooredValue,
      fractional: scaledValue - flooredValue,
    };
  });

  let remaining = normalizedTarget - allocations.reduce((sum, entry) => sum + entry.totalCents, 0);
  if (remaining > 0) {
    allocations
      .slice()
      .sort((left, right) => {
        const fractionComparison = right.fractional - left.fractional;
        if (fractionComparison !== 0) {
          return fractionComparison;
        }

        return left.index - right.index;
      })
      .slice(0, remaining)
      .forEach((entry) => {
        entry.totalCents += 1;
      });
  }

  return allocations
    .map((entry) => ({
      ...entry.bucket,
      totalCents: entry.totalCents,
    }))
    .filter((entry) => entry.totalCents > 0);
}

function groupMoneyFlowExpenseCategoriesByThreshold(
  categories: ReadonlyArray<{ categoryId: number | null; categoryName: string; totalCents: number }>,
  expensesTotalCents: number,
  otherLabel: string,
): Array<{
  categoryId: number | null;
  categoryName: string;
  totalCents: number;
  tooltipDetails?: readonly { categoryName: string; totalCents: number }[];
}> {
  const normalizedExpensesTotalCents = Math.max(0, Number(expensesTotalCents));
  if (normalizedExpensesTotalCents <= 0 || categories.length === 0) {
    return [];
  }

  const majorCategories: Array<{ categoryId: number | null; categoryName: string; totalCents: number }> = [];
  const minorCategories: Array<{ categoryId: number | null; categoryName: string; totalCents: number }> = [];

  for (const category of categories) {
    const totalCents = Math.max(0, Number(category.totalCents));
    if (totalCents <= 0) {
      continue;
    }

    if (totalCents / normalizedExpensesTotalCents >= MONEY_FLOW_EXPENSE_CATEGORY_GROUP_THRESHOLD) {
      majorCategories.push({ categoryId: category.categoryId, categoryName: category.categoryName, totalCents });
      continue;
    }

    minorCategories.push({ categoryId: category.categoryId, categoryName: category.categoryName, totalCents });
  }

  if (minorCategories.length === 0) {
    return majorCategories;
  }

  const othersTotalCents = minorCategories.reduce((total, category) => total + category.totalCents, 0);
  if (othersTotalCents <= 0) {
    return majorCategories;
  }

  return [
    ...majorCategories,
    {
      categoryId: null,
      categoryName: otherLabel,
      totalCents: othersTotalCents,
      tooltipDetails: minorCategories
        .slice()
        .sort((left, right) => right.totalCents - left.totalCents || left.categoryName.localeCompare(right.categoryName)),
    },
  ];
}

interface NetWorthDistributionEntry {
  readonly accountId: number;
  readonly accountName: string;
  readonly netWorthCents: number;
  readonly absoluteCents: number;
}

@Component({
  selector: 'app-overview-page',
  imports: [
    AppBaseCardComponent,
    AppBarChartComponent,
    AppSankeyChartComponent,
    AppTransactionListCardComponent,
    TranslatePipe,
    ZardIconComponent,
    ZardLoaderComponent,
  ],
  templateUrl: './overview-page.html',
})
export class OverviewPage implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild(AppTransactionListCardComponent) private recentTransactionsCardComponent?: AppTransactionListCardComponent;
  @ViewChild('moneyFlowSankeyCard', { read: ElementRef }) private moneyFlowSankeyCardElement?: ElementRef<HTMLElement>;

  private releaseToolbarActions: (() => void) | null = null;
  private languageChangeSubscription: Subscription | null = null;
  private moneyFlowSankeyCardResizeObserver: ResizeObserver | null = null;
  private readonly isToolbarReloading = signal(false);
  private accountColorHexById = new Map<number, string>();
  private categoryColorHexById = new Map<number, string>();
  private monthlyTotalsRowsCache: ReadonlyArray<{
    month: string;
    incomes_cents: number;
    expenses_cents: number;
    net_cashflow_cents: number;
  }> = [];
  private moneyFlowSankeyResponseCache: {
    totals?: {
      incomes_cents?: number;
      expenses_cents?: number;
      savings_cents?: number;
      investments_cents?: number;
      crypto_cents?: number;
      net_cashflow_cents?: number;
    };
    expense_by_category?: ReadonlyArray<{
      category_id?: number | null;
      category_name?: string;
      total_cents?: number;
    }>;
    expense_categories?: ReadonlyArray<{
      category_id?: number | null;
      category_name?: string;
      total_cents?: number;
    }>;
  } | null = null;
  protected readonly isSmallScreen = signal(false);
  protected readonly isSummaryCardsLoading = signal(true);
  protected readonly summaryCardsLoadError = signal<string | null>(null);
  protected readonly totalNetWorthCents = signal(0);
  protected readonly totalNetWorthPreviousMonthTotalCents = signal(0);
  protected readonly totalNetWorthPreviousMonthDeltaCents = signal(0);
  protected readonly totalReceivablesCents = signal(0);
  protected readonly totalPayablesCents = signal(0);
  protected readonly totalNetWorthPreviousMonthDeltaPercent = computed(() => {
    const previousTotalCents = this.totalNetWorthPreviousMonthTotalCents();
    const deltaCents = this.totalNetWorthPreviousMonthDeltaCents();
    if (!Number.isFinite(previousTotalCents) || Math.abs(previousTotalCents) < 1) {
      return 0;
    }

    return (deltaCents / Math.abs(previousTotalCents)) * 100;
  });
  protected readonly totalNetWorthPreviousMonthDeltaTrendIcon = computed<ZardIcon>(() => {
    const deltaCents = this.totalNetWorthPreviousMonthDeltaCents();
    if (deltaCents > 0) {
      return 'arrow-up';
    }

    if (deltaCents < 0) {
      return 'arrow-down';
    }

    return 'circle';
  });
  protected readonly totalNetWorthPreviousMonthDeltaColor = computed(() => {
    const deltaCents = this.totalNetWorthPreviousMonthDeltaCents();
    if (deltaCents > 0) {
      return 'var(--chart-income)';
    }

    if (deltaCents < 0) {
      return 'var(--chart-expense)';
    }

    return 'var(--muted-foreground)';
  });
  protected readonly totalAfterReceivablesPayablesCents = computed(
    () => this.totalNetWorthCents() + this.totalReceivablesCents() - this.totalPayablesCents(),
  );
  private readonly currentDateReference = new Date();
  protected readonly totalNetWorthAverageDailyMonthToDateDeltaCents = computed(() => {
    const deltaCents = this.totalNetWorthPreviousMonthDeltaCents();
    const elapsedDays = Math.max(1, this.currentDateReference.getDate());
    return deltaCents / elapsedDays;
  });
  protected readonly currentCalendarYear = this.currentDateReference.getFullYear();
  protected readonly currentCalendarMonthIndex = this.currentDateReference.getMonth();
  protected readonly netWorthDistributionBarHeight = computed(() =>
    this.isSmallScreen() ? NET_WORTH_DISTRIBUTION_BAR_HEIGHT_MOBILE : NET_WORTH_DISTRIBUTION_BAR_HEIGHT_DESKTOP,
  );
  protected readonly monthlyTotalsBarChartHeight = computed(() =>
    this.isSmallScreen() ? MONTHLY_TOTALS_BAR_CHART_HEIGHT_MOBILE : MONTHLY_TOTALS_BAR_CHART_HEIGHT_DESKTOP,
  );
  protected readonly moneyFlowSankeyChartHeight = computed(() =>
    this.isSmallScreen() ? MONEY_FLOW_SANKEY_CHART_HEIGHT_MOBILE : MONEY_FLOW_SANKEY_CHART_HEIGHT_DESKTOP,
  );
  private readonly measuredMoneyFlowSankeyCardHeight = signal<string | null>(null);
  protected readonly lastTransactionsCardHeight = computed(() =>
    this.isSmallScreen() ? null : this.measuredMoneyFlowSankeyCardHeight(),
  );
  protected readonly netWorthDistributionBarLabels: readonly string[] = [' '];
  protected netWorthDistributionBarSeries: readonly AppBarChartSeries[] = [];
  protected readonly isMonthlyTotalsLoading = signal(true);
  protected readonly monthlyTotalsLoadError = signal<string | null>(null);
  protected monthlyTotalsLabels: readonly string[] = [];
  protected monthlyTotalsBarSeries: readonly AppBarChartSeries[] = [];
  protected readonly isMoneyFlowSankeyLoading = signal(true);
  protected readonly moneyFlowSankeyLoadError = signal<string | null>(null);
  protected moneyFlowSankeyNodes: readonly AppSankeyChartNode[] = [];
  protected moneyFlowSankeyLinks: readonly AppSankeyChartLink[] = [];

  constructor(
    private readonly toolbarContextService: ToolbarContextService,
    private readonly analyticsService: AnalyticsService,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly localPreferencesService: LocalPreferencesService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    this.updateResponsiveState();
    this.monthlyTotalsBarSeries = this.buildMonthlyTotalsBarSeries([]);
    this.languageChangeSubscription = this.translateService.onLangChange.subscribe(() => {
      this.rebuildLocalizedOverviewCharts();
      this.activateToolbarActions();
    });
    this.activateToolbarActions();
    void this.loadSummaryCards();
    void this.loadExpensesIncomesNetCashflowByMonth();
    void this.loadMoneyFlowSankeyByMonth();
  }

  ngAfterViewInit(): void {
    this.observeMoneyFlowSankeyCardHeight();
  }

  ngOnDestroy(): void {
    this.moneyFlowSankeyCardResizeObserver?.disconnect();
    this.moneyFlowSankeyCardResizeObserver = null;
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
    this.languageChangeSubscription?.unsubscribe();
    this.languageChangeSubscription = null;
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.updateResponsiveState();
  }

  private observeMoneyFlowSankeyCardHeight(): void {
    const element = this.moneyFlowSankeyCardElement?.nativeElement;
    if (!element) {
      return;
    }

    this.updateMeasuredMoneyFlowSankeyCardHeight(element);

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    this.moneyFlowSankeyCardResizeObserver?.disconnect();
    this.moneyFlowSankeyCardResizeObserver = new ResizeObserver(() => {
      this.updateMeasuredMoneyFlowSankeyCardHeight(element);
    });
    this.moneyFlowSankeyCardResizeObserver.observe(element);
  }

  private updateMeasuredMoneyFlowSankeyCardHeight(element: HTMLElement): void {
    const nextHeight = Math.round(element.getBoundingClientRect().height);
    this.measuredMoneyFlowSankeyCardHeight.set(nextHeight > 0 ? `${nextHeight}px` : null);
  }

  private async loadExpensesIncomesNetCashflowByMonth(): Promise<void> {
    this.isMonthlyTotalsLoading.set(true);
    this.monthlyTotalsLoadError.set(null);

    try {
      const { from, to } = toYearRangeTimestamps(this.currentCalendarYear);
      const response = await this.analyticsService.expensesIncomesNetCashflowByMonth({
        filters: { from, to },
      });
      const rows = response.rows;
      this.monthlyTotalsRowsCache = rows;
      this.monthlyTotalsLabels = rows.map((row) => formatMonthLabel(row.month, this.resolveLocale()));
      this.monthlyTotalsBarSeries = this.buildMonthlyTotalsBarSeries(rows);
    } catch (error) {
      console.error('[overview-page] Failed to load monthly analytics:', error);
      this.monthlyTotalsLoadError.set(
        error instanceof Error ? error.message : 'Unexpected error while loading analytics.',
      );
    } finally {
      this.isMonthlyTotalsLoading.set(false);
    }
  }

  private async loadSummaryCards(): Promise<void> {
    this.isSummaryCardsLoading.set(true);
    this.summaryCardsLoadError.set(null);

    try {
      const [netWorthResponse, receivablesPayablesResponse, accounts] = await Promise.all([
        this.analyticsService.netWorthByAccount(),
        this.analyticsService.receivablesPayables(),
        this.accountsService.listAll().catch((error) => {
          console.warn('[overview-page] Failed to load account colors for net worth chart:', error);
          return [];
        }),
      ]);
      this.accountColorHexById = new Map(
        accounts.map((account) => [account.id, resolveVisualColorHex(account.colorKey)] as const),
      );

      const totalNetWorthCents = netWorthResponse.rows.reduce(
        (total, row) => total + Number(row.net_worth_cents ?? 0),
        0,
      );
      const previousMonthDeltaCents = Number(
        netWorthResponse.totals?.previous_month_delta_cents ?? 0,
      );
      const distributionEntries: NetWorthDistributionEntry[] = netWorthResponse.rows
        .map((row) => {
          const netWorthCents = Number(row.net_worth_cents ?? 0);
          const absoluteCents = Math.abs(netWorthCents);

          return {
            accountId: Number(row.account_id),
            accountName: row.account_name,
            netWorthCents,
            absoluteCents,
          };
        })
        .filter((entry) => entry.absoluteCents > 0);

      const totalAbsoluteCents = distributionEntries.reduce((total, entry) => total + entry.absoluteCents, 0);
      if (totalAbsoluteCents <= 0) {
        this.netWorthDistributionBarSeries = [];
      } else {
        const majorEntries = distributionEntries.filter(
          (entry) => entry.absoluteCents / totalAbsoluteCents >= NET_WORTH_PIE_OTHERS_THRESHOLD,
        );
        const minorEntries = distributionEntries.filter(
          (entry) => entry.absoluteCents / totalAbsoluteCents < NET_WORTH_PIE_OTHERS_THRESHOLD,
        );

        const distributionSeries: AppBarChartSeries[] = majorEntries.map((entry) => ({
          name: entry.accountName,
          data: [toPercent(entry.absoluteCents, totalAbsoluteCents)],
          stack: 'net-worth-distribution',
          cornerRadius: 0,
          color: this.accountColorHexById.get(entry.accountId),
          tooltipValueText: this.formatCurrencyFromCents(entry.netWorthCents),
        }));

        if (minorEntries.length > 0) {
          const othersAbsoluteCents = minorEntries.reduce((total, entry) => total + entry.absoluteCents, 0);
          const tooltipDetails = minorEntries
            .slice()
            .sort((left, right) => right.absoluteCents - left.absoluteCents || left.accountName.localeCompare(right.accountName))
            .map((entry) => `• ${entry.accountName}: ${this.formatCurrencyFromCents(entry.netWorthCents)}`);

          distributionSeries.push({
            name: this.translate('overview.pie.others'),
            data: [toPercent(othersAbsoluteCents, totalAbsoluteCents)],
            stack: 'net-worth-distribution',
            cornerRadius: 0,
            color: resolveChartCssColor(`--${DEFAULT_VISUAL_COLOR_KEY}`, '#9ca3af'),
            tooltipDetails,
            tooltipHideValue: true,
          });
        }

        this.netWorthDistributionBarSeries = distributionSeries;
      }

      this.totalNetWorthCents.set(totalNetWorthCents);
      this.totalNetWorthPreviousMonthTotalCents.set(Number(netWorthResponse.totals?.previous_month_total_cents ?? 0));
      this.totalNetWorthPreviousMonthDeltaCents.set(
        Number.isFinite(previousMonthDeltaCents) ? previousMonthDeltaCents : 0,
      );
      this.totalReceivablesCents.set(Number(receivablesPayablesResponse.totals?.receivables_cents ?? 0));
      this.totalPayablesCents.set(Number(receivablesPayablesResponse.totals?.payables_cents ?? 0));
    } catch (error) {
      console.error('[overview-page] Failed to load summary cards:', error);
      this.netWorthDistributionBarSeries = [];
      this.totalNetWorthPreviousMonthTotalCents.set(0);
      this.totalNetWorthPreviousMonthDeltaCents.set(0);
      this.summaryCardsLoadError.set(
        error instanceof Error ? error.message : 'Unexpected error while loading summary cards.',
      );
    } finally {
      this.isSummaryCardsLoading.set(false);
    }
  }

  private async loadMoneyFlowSankeyByMonth(): Promise<void> {
    this.isMoneyFlowSankeyLoading.set(true);
    this.moneyFlowSankeyLoadError.set(null);

    try {
      const { from, to } = toMonthRangeTimestamps(this.currentCalendarYear, this.currentCalendarMonthIndex);
      const [response, categories] = await Promise.all([
        this.analyticsService.moneyFlowSankeyByMonth({
          filters: {
            from,
            to,
          },
        }),
        this.categoriesService.listAll().catch((error) => {
          console.warn('[overview-page] Failed to load category colors for money flow sankey:', error);
          return [];
        }),
      ]);
      this.categoryColorHexById = new Map(
        categories.map((category) => [category.id, resolveVisualColorHex(category.colorKey)] as const),
      );
      this.moneyFlowSankeyResponseCache = response;
      const { nodes, links } = this.buildMoneyFlowSankeyChart(response);
      this.moneyFlowSankeyNodes = nodes;
      this.moneyFlowSankeyLinks = links;
    } catch (error) {
      console.error('[overview-page] Failed to load money flow sankey analytics:', error);
      this.moneyFlowSankeyNodes = [];
      this.moneyFlowSankeyLinks = [];
      this.moneyFlowSankeyResponseCache = null;
      this.moneyFlowSankeyLoadError.set(
        error instanceof Error ? error.message : 'Unexpected error while loading money flow analytics.',
      );
    } finally {
      this.isMoneyFlowSankeyLoading.set(false);
    }
  }

  protected formatCurrencyFromCents(amountCents: number): string {
    const currency = this.localPreferencesService.getCurrency().toUpperCase();
    const amount = amountCents / AMOUNT_CENTS_DIVISOR;

    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  }

  protected formatPercent(value: number): string {
    const normalizedValue = Number.isFinite(value) ? Math.abs(value) : 0;

    try {
      return `${new Intl.NumberFormat(this.resolveLocale(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(normalizedValue)}%`;
    } catch {
      return `${normalizedValue.toFixed(2)}%`;
    }
  }

  protected formatSignedCurrencyFromCents(amountCents: number): string {
    const normalizedAmountCents = Number.isFinite(Number(amountCents)) ? Number(amountCents) : 0;
    if (normalizedAmountCents === 0) {
      return this.formatCurrencyFromCents(0);
    }

    const sign = normalizedAmountCents > 0 ? '+' : '-';
    return `${sign}${this.formatCurrencyFromCents(Math.abs(normalizedAmountCents))}`;
  }

  protected moneyFlowSankeyMonthLabel(): string {
    try {
      return new Intl.DateTimeFormat(this.translateService.getCurrentLang() || undefined, {
        month: 'long',
        year: 'numeric',
      }).format(new Date(this.currentCalendarYear, this.currentCalendarMonthIndex, 1));
    } catch {
      return new Intl.DateTimeFormat(undefined, {
        month: 'long',
        year: 'numeric',
      }).format(new Date(this.currentCalendarYear, this.currentCalendarMonthIndex, 1));
    }
  }

  private activateToolbarActions(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.overview',
      actions: this.buildToolbarActions(),
    });
  }

  private buildToolbarActions(): readonly ToolbarAction[] {
    return [
      {
        id: 'overview-today-info',
        label: this.formatToolbarCurrentDateLabel(),
        icon: 'calendar',
        buttonType: 'ghost',
        buttonSize: 'sm',
        disabled: true,
        action: () => {},
      },
      {
        id: 'overview-reload',
        label: 'overview.toolbar.reload',
        icon: 'loader-circle',
        buttonType: 'outline',
        buttonSize: 'sm',
        disabled: () =>
          this.isToolbarReloading() ||
          this.isSummaryCardsLoading() ||
          this.isMonthlyTotalsLoading() ||
          this.isMoneyFlowSankeyLoading(),
        action: async () => {
          await this.reloadOverviewData();
        },
      },
    ];
  }

  private formatToolbarCurrentDateLabel(): string {
    try {
      return new Intl.DateTimeFormat(this.resolveLocale(), {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(this.currentDateReference);
    } catch {
      return this.currentDateReference.toDateString();
    }
  }

  private async reloadOverviewData(): Promise<void> {
    if (this.isToolbarReloading()) {
      return;
    }

    this.isToolbarReloading.set(true);
    try {
      await Promise.all([
        this.loadSummaryCards(),
        this.loadExpensesIncomesNetCashflowByMonth(),
        this.loadMoneyFlowSankeyByMonth(),
        this.recentTransactionsCardComponent?.reload() ?? Promise.resolve(),
      ]);
    } finally {
      this.isToolbarReloading.set(false);
    }
  }

  private updateResponsiveState(): void {
    this.isSmallScreen.set(detectSmallScreenViewport());
  }

  private rebuildLocalizedOverviewCharts(): void {
    if (this.monthlyTotalsRowsCache.length > 0) {
      this.monthlyTotalsLabels = this.monthlyTotalsRowsCache.map((row) => formatMonthLabel(row.month, this.resolveLocale()));
      this.monthlyTotalsBarSeries = this.buildMonthlyTotalsBarSeries(this.monthlyTotalsRowsCache);
    } else {
      this.monthlyTotalsBarSeries = this.buildMonthlyTotalsBarSeries([]);
    }

    if (this.moneyFlowSankeyResponseCache) {
      const { nodes, links } = this.buildMoneyFlowSankeyChart(this.moneyFlowSankeyResponseCache);
      this.moneyFlowSankeyNodes = nodes;
      this.moneyFlowSankeyLinks = links;
    }
  }

  private resolveLocale(): string | undefined {
    const currentLanguage = this.translateService.getCurrentLang();
    return typeof currentLanguage === 'string' && currentLanguage.trim().length > 0
      ? currentLanguage
      : undefined;
  }

  private buildMonthlyTotalsBarSeries(
    rows: ReadonlyArray<{ incomes_cents: number; expenses_cents: number; net_cashflow_cents: number }>,
  ): readonly AppBarChartSeries[] {
    return [
      {
        name: this.translate('overview.cards.monthlyTotals.series.incomes'),
        data: rows.map((row) => toAmount(row.incomes_cents)),
        themeColor: 'chart-income',
      },
      {
        name: this.translate('overview.cards.monthlyTotals.series.expenses'),
        data: rows.map((row) => toAbsoluteAmount(row.expenses_cents)),
        themeColor: 'chart-expense',
      },
      {
        name: this.translate('overview.cards.monthlyTotals.series.netCashflow'),
        data: rows.map((row) => toAmount(row.net_cashflow_cents)),
        themeColor: 'chart-net-cashflow',
      },
    ];
  }

  private buildMoneyFlowSankeyChart(response: {
    totals?: {
      incomes_cents?: number;
      expenses_cents?: number;
      savings_cents?: number;
      investments_cents?: number;
      crypto_cents?: number;
      net_cashflow_cents?: number;
    };
    expense_by_category?: ReadonlyArray<{
      category_id?: number | null;
      category_name?: string;
      total_cents?: number;
    }>;
    expense_categories?: ReadonlyArray<{
      category_id?: number | null;
      category_name?: string;
      total_cents?: number;
    }>;
  }): { nodes: readonly AppSankeyChartNode[]; links: readonly AppSankeyChartLink[] } {
    const incomesLabel = this.translate('overview.cards.moneyFlowSankey.nodes.incomes');
    const expensesLabel = this.translate('overview.cards.moneyFlowSankey.nodes.expenses');
    const savingsLabel = this.translate('overview.cards.moneyFlowSankey.nodes.savings');
    const investmentsLabel = this.translate('overview.cards.moneyFlowSankey.nodes.investments');
    const cryptoLabel = this.translate('overview.cards.moneyFlowSankey.nodes.crypto');
    const netCashflowLabel = this.translate('overview.cards.moneyFlowSankey.nodes.netCashflow');
    const priorBalancesLabel = this.translate('overview.cards.moneyFlowSankey.nodes.priorBalances');
    const unusedLabel = this.translate('overview.cards.moneyFlowSankey.nodes.unused');
    const otherExpensesLabel = this.translate('overview.cards.moneyFlowSankey.nodes.otherExpenses');

    const links: AppSankeyChartLink[] = [];
    const nodesByName = new Map<string, AppSankeyChartNode>();
    const ensureNode = (node: AppSankeyChartNode): void => {
      if (!nodesByName.has(node.name)) {
        nodesByName.set(node.name, node);
      }
    };
    const addLink = (source: string, target: string, value: number): void => {
      if (!Number.isFinite(value) || value <= 0) {
        return;
      }

      links.push({ source, target, value });
    };

    const totals = response.totals ?? {};
    const incomesTotalCents = Math.max(0, Number(totals.incomes_cents ?? 0));
    const expensesTotalCents = Math.max(0, Number(totals.expenses_cents ?? 0));
    const savingsTotalCents = Math.max(0, Number(totals.savings_cents ?? 0));
    const investmentsTotalCents = Math.max(0, Number(totals.investments_cents ?? 0));
    const cryptoTotalCents = Math.max(0, Number(totals.crypto_cents ?? 0));
    const rawNetCashflowTotalCents = Number(totals.net_cashflow_cents ?? (incomesTotalCents - expensesTotalCents));
    const netCashflowTotalCents = Math.max(0, rawNetCashflowTotalCents);
    const incomesToExpensesCents = Math.min(incomesTotalCents, expensesTotalCents);
    const priorBalancesToExpensesCents = Math.max(0, expensesTotalCents - incomesTotalCents);
    const allocationTargets = [
      { key: 'savings', label: savingsLabel, totalCents: savingsTotalCents, themeColor: 'chart-5' as const },
      { key: 'investments', label: investmentsLabel, totalCents: investmentsTotalCents, themeColor: 'chart-4' as const },
      { key: 'crypto', label: cryptoLabel, totalCents: cryptoTotalCents, themeColor: 'chart-7' as const },
    ].filter((target) => target.totalCents > 0);
    const totalAllocationCents = allocationTargets.reduce((sum, target) => sum + target.totalCents, 0);
    const netCashflowAllocatedToTargetsCents = Math.min(netCashflowTotalCents, totalAllocationCents);
    const netCashflowAllocationByTarget = new Map(
      allocateBucketsToTargetTotalCents(
        allocationTargets.map((target) => ({
          key: target.key,
          totalCents: target.totalCents,
        })),
        netCashflowAllocatedToTargetsCents,
      ).map((bucket) => [bucket.key, bucket.totalCents]),
    );
    const priorBalancesAllocationByTarget = new Map(
      allocationTargets
        .map((target) => {
          const netContribution = netCashflowAllocationByTarget.get(target.key) ?? 0;
          return [target.key, Math.max(0, target.totalCents - netContribution)] as const;
        })
        .filter((entry) => entry[1] > 0),
    );
    const priorBalancesToAllocationsCents = Array.from(priorBalancesAllocationByTarget.values()).reduce(
      (sum, value) => sum + value,
      0,
    );
    const priorBalancesTotalCents = priorBalancesToExpensesCents + priorBalancesToAllocationsCents;
    const unusedNetCashflowCents = Math.max(
      0,
      netCashflowTotalCents - netCashflowAllocatedToTargetsCents,
    );
    const netCashflowTooltipDetails = rawNetCashflowTotalCents < 0
      ? [
          `${this.translate('overview.cards.moneyFlowSankey.tooltips.actualNetCashflow')}: ${this.formatCurrencyFromCents(rawNetCashflowTotalCents)}`,
        ]
      : undefined;

    ensureNode({ name: incomesLabel, value: toAmount(incomesTotalCents), themeColor: 'chart-income' });
    if (expensesTotalCents > 0) {
      ensureNode({ name: expensesLabel, value: toAmount(expensesTotalCents), themeColor: 'chart-expense' });
      if (incomesToExpensesCents > 0) {
        addLink(incomesLabel, expensesLabel, toAmount(incomesToExpensesCents));
      }
      if (priorBalancesToExpensesCents > 0) {
        addLink(priorBalancesLabel, expensesLabel, toAmount(priorBalancesToExpensesCents));
      }
    }

    if (priorBalancesTotalCents > 0) {
      ensureNode({
        name: priorBalancesLabel,
        value: toAmount(priorBalancesTotalCents),
        themeColor: 'chart-prior-balance',
      });
    }

    const shouldRenderNetCashflowNode =
      rawNetCashflowTotalCents !== 0 || totalAllocationCents > 0 || unusedNetCashflowCents > 0;
    if (shouldRenderNetCashflowNode) {
      ensureNode({
        name: netCashflowLabel,
        value: toAmount(netCashflowTotalCents),
        themeColor: 'chart-net-cashflow',
        tooltipDetails: netCashflowTooltipDetails,
      });
      if (netCashflowTotalCents > 0) {
        addLink(incomesLabel, netCashflowLabel, toAmount(netCashflowTotalCents));
      }
    }

    for (const target of allocationTargets) {
      ensureNode({ name: target.label, value: toAmount(target.totalCents), themeColor: target.themeColor });

      const netCashflowContributionCents = netCashflowAllocationByTarget.get(target.key) ?? 0;
      if (netCashflowContributionCents > 0) {
        addLink(netCashflowLabel, target.label, toAmount(netCashflowContributionCents));
      }

      const priorBalancesContributionCents = priorBalancesAllocationByTarget.get(target.key) ?? 0;
      if (priorBalancesContributionCents > 0) {
        addLink(priorBalancesLabel, target.label, toAmount(priorBalancesContributionCents));
      }
    }

    if (unusedNetCashflowCents > 0) {
      ensureNode({ name: unusedLabel, value: toAmount(unusedNetCashflowCents), themeColor: 'chart-6' });
      addLink(netCashflowLabel, unusedLabel, toAmount(unusedNetCashflowCents));
    }

    const positiveExpenseCategories = (response.expense_by_category ?? response.expense_categories ?? [])
      .map((row) => ({
        categoryId: row.category_id == null ? null : Number(row.category_id),
        categoryName:
          row.category_id == null || String(row.category_name ?? '').trim() === '__other__'
            ? otherExpensesLabel
            : this.translate(String(row.category_name ?? '').trim() || otherExpensesLabel),
        totalCents: Math.max(0, Number(row.total_cents ?? 0)),
      }))
      .filter((row) => row.totalCents > 0);

    if (positiveExpenseCategories.length > 0 && expensesTotalCents > 0) {
      const groupedExpenseCategories = groupMoneyFlowExpenseCategoriesByThreshold(
        positiveExpenseCategories,
        expensesTotalCents,
        otherExpensesLabel,
      );

      for (const categoryRow of groupedExpenseCategories) {
        const isOtherExpensesBucket = categoryRow.categoryName === otherExpensesLabel;
        const tooltipDetails = isOtherExpensesBucket
          ? (categoryRow.tooltipDetails ?? []).map(
              (detail) => `• ${detail.categoryName}: ${this.formatCurrencyFromCents(detail.totalCents)}`,
            )
          : undefined;
        const categoryColor =
          !isOtherExpensesBucket && categoryRow.categoryId != null
            ? this.categoryColorHexById.get(categoryRow.categoryId) ?? null
            : null;
        ensureNode({
          name: categoryRow.categoryName,
          value: toAmount(categoryRow.totalCents),
          tooltipDetails,
          ...(categoryColor ? { color: categoryColor } : {}),
          ...(isOtherExpensesBucket ? { themeColor: 'chart-8' as const } : {}),
        });
        addLink(expensesLabel, categoryRow.categoryName, toAmount(categoryRow.totalCents));
      }
    }

    if (links.length === 0) {
      return { nodes: [], links: [] };
    }

    return {
      nodes: Array.from(nodesByName.values()),
      links,
    };
  }

  private translate(key: string, params?: Record<string, unknown>): string {
    const translated = this.translateService.instant(key, params);
    return typeof translated === 'string' ? translated : key;
  }
}
