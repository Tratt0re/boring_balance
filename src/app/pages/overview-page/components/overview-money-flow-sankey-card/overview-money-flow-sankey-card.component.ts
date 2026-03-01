import {
  ChangeDetectionStrategy,
  Component,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  computed,
  effect,
  input,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { AppBaseCardComponent } from '@/components/base-card';
import { type AppSankeyChartLink, type AppSankeyChartNode, AppSankeyChartComponent } from '@/components/charts';
import type { AnalyticsMoneyFlowSankeyByMonthResponse } from '@/dtos';
import { AnalyticsService } from '@/services/analytics.service';
import { CategoriesService } from '@/services/categories.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { NumberFormatService } from '@/services/number-format.service';
import { ZardLoaderComponent } from '@/shared/components/loader';
import {
  allocateBucketsToTargetTotalCents,
  groupMoneyFlowExpenseCategoriesByThreshold,
  resolveVisualColorHex,
  toAmount,
  toMonthRangeTimestamps,
} from '../overview-cards.utils';

const AMOUNT_CENTS_DIVISOR = 100;
const MONEY_FLOW_SANKEY_CHART_HEIGHT_DESKTOP = '16rem';
const MONEY_FLOW_SANKEY_CHART_HEIGHT_MOBILE = '18rem';

@Component({
  selector: 'app-overview-money-flow-sankey-card',
  imports: [
    AppBaseCardComponent,
    AppSankeyChartComponent,
    TranslatePipe,
    ZardLoaderComponent,
  ],
  templateUrl: './overview-money-flow-sankey-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class OverviewMoneyFlowSankeyCardComponent implements OnInit, OnDestroy, OnChanges {
  private languageChangeSubscription: Subscription | null = null;
  private categoryColorHexById = new Map<number, string>();
  private responseCache: AnalyticsMoneyFlowSankeyByMonthResponse | null = null;

  readonly year = input(new Date().getFullYear());
  readonly monthIndex = input(new Date().getMonth());
  readonly isSmallScreen = input(false);

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly nodes = signal<readonly AppSankeyChartNode[]>([]);
  protected readonly links = signal<readonly AppSankeyChartLink[]>([]);
  protected readonly chartHeight = computed(() =>
    this.isSmallScreen() ? MONEY_FLOW_SANKEY_CHART_HEIGHT_MOBILE : MONEY_FLOW_SANKEY_CHART_HEIGHT_DESKTOP,
  );
  protected readonly currencyCode = computed(() => this.localPreferencesService.currencyPreference());

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly categoriesService: CategoriesService,
    private readonly localPreferencesService: LocalPreferencesService,
    private readonly numberFormatService: NumberFormatService,
    private readonly translateService: TranslateService,
  ) {
    effect(() => {
      this.numberFormatService.currencySymbol();
      this.numberFormatService.currencyFormatStyle();

      if (this.responseCache) {
        this.rebuildLocalizedViewModel();
      }
    });
  }

  ngOnInit(): void {
    this.languageChangeSubscription = this.translateService.onLangChange.subscribe(() => {
      this.rebuildLocalizedViewModel();
    });
    void this.loadData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const yearChange = changes['year'];
    const monthIndexChange = changes['monthIndex'];
    if ((yearChange && !yearChange.firstChange) || (monthIndexChange && !monthIndexChange.firstChange)) {
      void this.loadData();
    }
  }

  ngOnDestroy(): void {
    this.languageChangeSubscription?.unsubscribe();
    this.languageChangeSubscription = null;
  }

  async reload(): Promise<void> {
    await this.loadData();
  }

  protected monthLabel(): string {
    try {
      return new Intl.DateTimeFormat(this.translateService.getCurrentLang() || undefined, {
        month: 'long',
        year: 'numeric',
      }).format(new Date(this.year(), this.monthIndex(), 1));
    } catch {
      return new Intl.DateTimeFormat(undefined, {
        month: 'long',
        year: 'numeric',
      }).format(new Date(this.year(), this.monthIndex(), 1));
    }
  }

  private async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const { from, to } = toMonthRangeTimestamps(this.year(), this.monthIndex());
      const [response, categories] = await Promise.all([
        this.analyticsService.moneyFlowSankeyByMonth({
          filters: {
            from,
            to,
          },
        }),
        this.categoriesService.listAll().catch((error) => {
          console.warn('[overview-money-flow-sankey-card] Failed to load category colors for money flow sankey:', error);
          return [];
        }),
      ]);

      this.categoryColorHexById = new Map(
        categories.map((category) => [category.id, resolveVisualColorHex(category.colorKey)] as const),
      );
      this.responseCache = response;
      const { nodes, links } = this.buildMoneyFlowSankeyChart(response);
      this.nodes.set(nodes);
      this.links.set(links);
    } catch (error) {
      console.error('[overview-money-flow-sankey-card] Failed to load money flow sankey analytics:', error);
      this.nodes.set([]);
      this.links.set([]);
      this.responseCache = null;
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading money flow analytics.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private rebuildLocalizedViewModel(): void {
    if (!this.responseCache) {
      return;
    }

    const { nodes, links } = this.buildMoneyFlowSankeyChart(this.responseCache);
    this.nodes.set(nodes);
    this.links.set(links);
  }

  private formatCurrencyFromCents(amountCents: number): string {
    const amount = amountCents / AMOUNT_CENTS_DIVISOR;
    return this.numberFormatService.formatCurrency(amount);
  }

  private buildMoneyFlowSankeyChart(response: AnalyticsMoneyFlowSankeyByMonthResponse): {
    nodes: readonly AppSankeyChartNode[];
    links: readonly AppSankeyChartLink[];
  } {
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
    const unusedNetCashflowCents = Math.max(0, netCashflowTotalCents - netCashflowAllocatedToTargetsCents);
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
