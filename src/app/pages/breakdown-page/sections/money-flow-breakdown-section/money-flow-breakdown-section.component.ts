import {
  booleanAttribute,
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
import {
  AppSankeyChartComponent,
  resolveChartCssColor,
  type AppSankeyChartLink,
  type AppSankeyChartNode,
} from '@/components/charts';
import { DEFAULT_VISUAL_COLOR_KEY } from '@/config/visual-options.config';
import type { AnalyticsMoneyFlowSankeyByMonthResponse } from '@/dtos';
import { AnalyticsService } from '@/services/analytics.service';
import { CategoriesService } from '@/services/categories.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { NumberFormatService } from '@/services/number-format.service';
import { ZardLoaderComponent } from '@/shared/components/loader';

const AMOUNT_CENTS_DIVISOR = 100;
const MONEY_FLOW_SANKEY_CHART_HEIGHT_DESKTOP = 'max(24rem, calc(100dvh - 17rem))';
const MONEY_FLOW_SANKEY_CHART_HEIGHT_MOBILE = 'max(20rem, calc(100dvh - 18rem))';
const MONEY_FLOW_EXPENSE_CATEGORY_GROUP_THRESHOLD = 0.02;

function toAmount(amountCents: number): number {
  return amountCents / AMOUNT_CENTS_DIVISOR;
}

function toYearRangeTimestamps(year: number): { from: number; to: number } {
  return {
    from: new Date(year, 0, 1, 0, 0, 0, 0).getTime(),
    to: new Date(year, 11, 31, 23, 59, 59, 999).getTime(),
  };
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

  const remaining = normalizedTarget - allocations.reduce((sum, entry) => sum + entry.totalCents, 0);
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

@Component({
  selector: 'app-money-flow-breakdown-section',
  imports: [
    AppBaseCardComponent,
    AppSankeyChartComponent,
    TranslatePipe,
    ZardLoaderComponent,
  ],
  templateUrl: './money-flow-breakdown-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block flex-1 min-h-0',
  },
})
export class MoneyFlowBreakdownSectionComponent implements OnInit, OnDestroy, OnChanges {
  private languageChangeSubscription: Subscription | null = null;
  private categoryColorHexById = new Map<number, string>();
  private responseCache: AnalyticsMoneyFlowSankeyByMonthResponse | null = null;

  readonly year = input(new Date().getFullYear());
  readonly isSmallScreen = input(false, { transform: booleanAttribute });
  readonly showAllocationTargets = input(true, { transform: booleanAttribute });

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly sankeyNodes = signal<readonly AppSankeyChartNode[]>([]);
  protected readonly sankeyLinks = signal<readonly AppSankeyChartLink[]>([]);
  protected readonly hasData = computed(() => this.sankeyLinks().length > 0);
  protected readonly sankeyChartHeight = computed(() =>
    this.isSmallScreen() ? MONEY_FLOW_SANKEY_CHART_HEIGHT_MOBILE : MONEY_FLOW_SANKEY_CHART_HEIGHT_DESKTOP,
  );

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
    const showAllocationTargetsChange = changes['showAllocationTargets'];
    if (yearChange && !yearChange.firstChange) {
      void this.loadData();
      return;
    }

    if (showAllocationTargetsChange && !showAllocationTargetsChange.firstChange) {
      this.rebuildLocalizedViewModel();
    }
  }

  ngOnDestroy(): void {
    this.languageChangeSubscription?.unsubscribe();
    this.languageChangeSubscription = null;
  }

  private async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const { from, to } = toYearRangeTimestamps(this.year());
      const [response, categories] = await Promise.all([
        this.analyticsService.moneyFlowSankeyByMonth({
          filters: { from, to },
        }),
        this.categoriesService.listAll().catch((error) => {
          console.warn('[money-flow-breakdown-section] Failed to load category colors:', error);
          return [];
        }),
      ]);

      this.categoryColorHexById = new Map(
        categories.map((category) => [category.id, resolveVisualColorHex(category.colorKey)] as const),
      );
      this.responseCache = response;
      this.rebuildLocalizedViewModel();
    } catch (error) {
      console.error('[money-flow-breakdown-section] Failed to load money flow analytics:', error);
      this.responseCache = null;
      this.categoryColorHexById = new Map();
      this.sankeyNodes.set([]);
      this.sankeyLinks.set([]);
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading money flow analytics.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private rebuildLocalizedViewModel(): void {
    if (!this.responseCache) {
      this.sankeyNodes.set([]);
      this.sankeyLinks.set([]);
      return;
    }

    const { nodes, links } = this.buildMoneyFlowSankeyChart(this.responseCache);
    this.sankeyNodes.set(nodes);
    this.sankeyLinks.set(links);
  }

  private buildMoneyFlowSankeyChart(
    response: AnalyticsMoneyFlowSankeyByMonthResponse,
  ): { nodes: readonly AppSankeyChartNode[]; links: readonly AppSankeyChartLink[] } {
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
    const shouldRenderAllocationFlows = this.showAllocationTargets();
    const allocationTargets = (shouldRenderAllocationFlows
      ? [
      { key: 'savings', label: savingsLabel, totalCents: savingsTotalCents, themeColor: 'chart-5' as const },
      { key: 'investments', label: investmentsLabel, totalCents: investmentsTotalCents, themeColor: 'chart-4' as const },
      { key: 'crypto', label: cryptoLabel, totalCents: cryptoTotalCents, themeColor: 'chart-7' as const },
      ]
      : []
    ).filter((target) => target.totalCents > 0);
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
    const unusedNetCashflowCents = shouldRenderAllocationFlows
      ? Math.max(0, netCashflowTotalCents - netCashflowAllocatedToTargetsCents)
      : 0;
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

    const shouldRenderNetCashflowNode = shouldRenderAllocationFlows && (
      rawNetCashflowTotalCents !== 0 || totalAllocationCents > 0 || unusedNetCashflowCents > 0
    );
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

  private formatCurrencyFromCents(amountCents: number): string {
    const amount = amountCents / AMOUNT_CENTS_DIVISOR;
    return this.numberFormatService.formatCurrency(amount);
  }

  protected currentCurrencyCode(): string {
    return this.localPreferencesService.currencyPreference();
  }

  private translate(key: string, params?: Record<string, unknown>): string {
    const translated = this.translateService.instant(key, params);
    return typeof translated === 'string' ? translated : key;
  }
}
