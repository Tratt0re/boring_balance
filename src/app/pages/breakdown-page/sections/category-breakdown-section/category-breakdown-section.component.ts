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
import { AppDataTableComponent, type TableDataItem } from '@/components/data-table';
import { AppBarChartComponent, AppLineChartComponent, resolveChartCssColor, type AppBarChartSeries, type AppLineChartSeries } from '@/components/charts';
import { DEFAULT_VISUAL_COLOR_KEY } from '@/config/visual-options.config';
import type { AnalyticsCategoryByMonthRowDto, AnalyticsFilterPayload, CategoryType } from '@/dtos';
import { AnalyticsService } from '@/services/analytics.service';
import { CategoriesService } from '@/services/categories.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { NumberFormatService } from '@/services/number-format.service';
import { ZardLoaderComponent } from '@/shared/components/loader';

type BreakdownCategoryType = Extract<CategoryType, 'expense' | 'income'>;

const AMOUNT_CENTS_DIVISOR = 100;
const MONTHS_IN_YEAR = 12;
const MONTHLY_TREND_CHART_HEIGHT_DESKTOP = '16rem';
const MONTHLY_TREND_CHART_HEIGHT_MOBILE = '18rem';
const MONTHLY_BY_CATEGORY_CHART_HEIGHT_DESKTOP = '20rem';
const MONTHLY_BY_CATEGORY_CHART_HEIGHT_MOBILE = '24rem';

interface CategoryBreakdownSummaryItem {
  readonly categoryId: number;
  readonly categoryName: string;
  readonly totalCents: number;
  readonly averageMonthlyCents: number;
  readonly icon: string | null;
  readonly colorHex: string | null;
}

interface CategoryBreakdownAggregationBucket {
  readonly categoryId: number;
  readonly rawCategoryName: string;
  totalCents: number;
  readonly monthlyTotalsCents: number[];
}

interface CategoryBreakdownSummaryTableRow {
  readonly categoryId: number;
  readonly categoryName: string;
  readonly categoryIcon: string | null;
  readonly categoryColorHex: string | null;
  readonly totalAmount: number;
  readonly averageMonthlyAmount: number;
}

const CATEGORY_SUMMARY_TABLE_STRUCTURE: readonly TableDataItem[] = [
  {
    columnName: 'common.labels.category',
    columnKey: 'categoryName',
    type: 'string',
    sortable: true,
    cellIcon: {
      icon: 'circle',
      iconColumnKey: 'categoryIcon',
      colorHexColumnKey: 'categoryColorHex',
    },
  },
  {
    columnName: 'common.labels.amount',
    columnKey: 'totalAmount',
    type: 'currency',
    align: 'right',
    sortable: true,
    currency: {
      modality: 'none',
    },
  },
  {
    columnName: 'breakdown.metrics.avgPerMonth',
    columnKey: 'averageMonthlyAmount',
    type: 'currency',
    align: 'right',
    sortable: true,
    currency: {
      modality: 'none',
    },
  },
] as const;

function toAmount(amountCents: number): number {
  return amountCents / AMOUNT_CENTS_DIVISOR;
}

function toYearRangeTimestamps(year: number): { from: number; to: number } {
  return {
    from: new Date(year, 0, 1, 0, 0, 0, 0).getTime(),
    to: new Date(year, 11, 31, 23, 59, 59, 999).getTime(),
  };
}

function toMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey: string, locale?: string): string {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number.parseInt(yearText ?? '', 10);
  const month = Number.parseInt(monthText ?? '', 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return monthKey;
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
  }).format(new Date(year, month - 1, 1));
}

function resolveVisualColorHex(colorKey: string | null | undefined): string {
  const fallbackColor = resolveChartCssColor(`--${DEFAULT_VISUAL_COLOR_KEY}`, resolveChartCssColor('--muted-foreground', '#9ca3af'));
  if (typeof colorKey !== 'string' || colorKey.trim().length === 0) {
    return fallbackColor;
  }

  return resolveChartCssColor(`--${colorKey}`, fallbackColor);
}

function normalizeMagnitudeCents(value: number): number {
  const normalizedValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return Math.abs(normalizedValue);
}

function parseMonthIndexFromMonthKey(monthKey: string, targetYear: number): number | null {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number.parseInt(yearText ?? '', 10);
  const month = Number.parseInt(monthText ?? '', 10);
  if (!Number.isInteger(year) || year !== targetYear || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return month - 1;
}

@Component({
  selector: 'app-category-breakdown-section',
  imports: [
    AppBaseCardComponent,
    AppBarChartComponent,
    AppDataTableComponent,
    AppLineChartComponent,
    TranslatePipe,
    ZardLoaderComponent,
  ],
  templateUrl: './category-breakdown-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryBreakdownSectionComponent implements OnInit, OnDestroy, OnChanges {
  private readonly currentDateReference = new Date();
  private languageChangeSubscription: Subscription | null = null;
  private categoryColorHexById = new Map<number, string>();
  private categoryIconById = new Map<number, string | null>();
  private rawRowsCache: readonly AnalyticsCategoryByMonthRowDto[] = [];

  readonly categoryType = input.required<BreakdownCategoryType>();
  readonly year = input(new Date().getFullYear());
  readonly isSmallScreen = input(false, { transform: booleanAttribute });
  readonly useElapsedMonthsAverage = input(false, { transform: booleanAttribute });

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly monthlyLabels = signal<readonly string[]>([]);
  protected readonly monthlyTrendSeries = signal<readonly AppLineChartSeries[]>([]);
  protected readonly monthlyByCategorySeries = signal<readonly AppBarChartSeries[]>([]);
  protected readonly categorySummaries = signal<readonly CategoryBreakdownSummaryItem[]>([]);
  protected readonly yearTotalCents = signal(0);
  protected readonly averageBaseTotalCents = signal(0);
  protected readonly averageMonthsDivisor = signal(1);
  protected readonly categorySummaryTableStructure = CATEGORY_SUMMARY_TABLE_STRUCTURE;
  protected readonly categorySummaryTableRows = computed<readonly CategoryBreakdownSummaryTableRow[]>(() =>
    this.categorySummaries().map((item) => ({
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      categoryIcon: item.icon,
      categoryColorHex: item.colorHex,
      totalAmount: toAmount(item.totalCents),
      averageMonthlyAmount: toAmount(item.averageMonthlyCents),
    })),
  );

  protected readonly hasData = computed(() => this.categorySummaries().length > 0 && this.yearTotalCents() > 0);
  protected readonly avgMonthlyCents = computed(() => {
    const divisor = Math.max(1, this.averageMonthsDivisor());
    return this.averageBaseTotalCents() / divisor;
  });
  protected readonly monthlyTrendChartHeight = computed(() =>
    this.isSmallScreen() ? MONTHLY_TREND_CHART_HEIGHT_MOBILE : MONTHLY_TREND_CHART_HEIGHT_DESKTOP,
  );
  protected readonly monthlyByCategoryChartHeight = computed(() =>
    this.isSmallScreen() ? MONTHLY_BY_CATEGORY_CHART_HEIGHT_MOBILE : MONTHLY_BY_CATEGORY_CHART_HEIGHT_DESKTOP,
  );
  protected readonly sectionLabelKey = computed(() =>
    this.categoryType() === 'expense'
      ? 'overview.cards.monthlyTotals.series.expenses'
      : 'overview.cards.monthlyTotals.series.incomes',
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

      if (!this.isLoading()) {
        this.rebuildLocalizedViewModel();
      }
    });
  }

  ngOnInit(): void {
    this.initializeLocalizedPlaceholders();
    this.languageChangeSubscription = this.translateService.onLangChange.subscribe(() => {
      this.rebuildLocalizedViewModel();
    });
    void this.loadData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const categoryTypeChange = changes['categoryType'];
    const yearChange = changes['year'];
    const useElapsedMonthsAverageChange = changes['useElapsedMonthsAverage'];

    const shouldReloadData =
      (categoryTypeChange && !categoryTypeChange.firstChange) ||
      (yearChange && !yearChange.firstChange);

    if (shouldReloadData) {
      void this.loadData();
      return;
    }

    if (useElapsedMonthsAverageChange && !useElapsedMonthsAverageChange.firstChange) {
      this.rebuildLocalizedViewModel();
    }
  }

  ngOnDestroy(): void {
    this.languageChangeSubscription?.unsubscribe();
    this.languageChangeSubscription = null;
  }

  protected monthlyTrendCardTitle(): string {
    return this.translate('breakdown.cards.monthlyTrend.title', {
      label: this.translate(this.sectionLabelKey()),
    });
  }

  protected monthlyTrendCardDescription(): string {
    return this.translate('breakdown.cards.monthlyTrend.description', {
      label: this.translate(this.sectionLabelKey()).toLowerCase(),
    });
  }

  protected monthlyByCategoryCardTitle(): string {
    return this.translate('breakdown.cards.monthlyByCategory.title', {
      label: this.translate(this.sectionLabelKey()),
    });
  }

  protected monthlyByCategoryCardDescription(): string {
    return this.translate('breakdown.cards.monthlyByCategory.description', {
      label: this.translate(this.sectionLabelKey()).toLowerCase(),
    });
  }

  protected formatCurrencyFromCents(amountCents: number): string {
    const amount = Number(amountCents) / AMOUNT_CENTS_DIVISOR;
    return this.numberFormatService.formatCurrency(amount);
  }

  protected currentCurrencyCode(): string {
    return this.localPreferencesService.currencyPreference();
  }

  private async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const year = this.year();
      const { from, to } = toYearRangeTimestamps(year);

      const [response, categories] = await Promise.all([
        this.fetchBreakdownRowsByCategoryType({
          filters: { from, to },
        }),
        this.categoriesService.listAll().catch((error) => {
          console.warn('[category-breakdown-section] Failed to load category colors:', error);
          return [];
        }),
      ]);

      this.categoryColorHexById = new Map(
        categories.map((category) => [category.id, resolveVisualColorHex(category.colorKey)] as const),
      );
      this.categoryIconById = new Map(
        categories.map((category) => [category.id, category.icon ?? null] as const),
      );
      this.rawRowsCache = response.rows ?? [];
      this.rebuildLocalizedViewModel();
    } catch (error) {
      console.error('[category-breakdown-section] Failed to load breakdown analytics:', error);
      this.rawRowsCache = [];
      this.categoryColorHexById = new Map();
      this.categoryIconById = new Map();
      this.initializeLocalizedPlaceholders();
      this.categorySummaries.set([]);
      this.yearTotalCents.set(0);
      this.averageBaseTotalCents.set(0);
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading analytics.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private initializeLocalizedPlaceholders(): void {
    const monthKeys = Array.from({ length: MONTHS_IN_YEAR }, (_, index) => toMonthKey(this.year(), index));
    const monthLabels = monthKeys.map((monthKey) => formatMonthLabel(monthKey, this.resolveLocale()));

    this.monthlyLabels.set(monthLabels);
    this.monthlyTrendSeries.set([
      {
        name: this.translate(this.sectionLabelKey()),
        data: Array.from({ length: MONTHS_IN_YEAR }, () => 0),
        themeColor: this.categoryType() === 'expense' ? 'chart-expense' : 'chart-income',
        smooth: true,
        showArea: true,
        areaOpacity: 0.2,
        lineWidth: 2.5,
      },
    ]);
    this.monthlyByCategorySeries.set([]);
    this.averageMonthsDivisor.set(this.resolveAverageMonthsDivisor());
    this.averageBaseTotalCents.set(0);
  }

  private rebuildLocalizedViewModel(): void {
    const year = this.year();
    const locale = this.resolveLocale();
    const monthLabels = Array.from({ length: MONTHS_IN_YEAR }, (_, monthIndex) =>
      formatMonthLabel(toMonthKey(year, monthIndex), locale),
    );

    const totalByMonthCents = Array.from({ length: MONTHS_IN_YEAR }, () => 0);
    const categoryBucketsById = new Map<number, CategoryBreakdownAggregationBucket>();

    for (const row of this.rawRowsCache) {
      const monthIndex = parseMonthIndexFromMonthKey(String(row.month ?? ''), year);
      if (monthIndex === null) {
        continue;
      }

      const categoryId = Number(row.category_id);
      if (!Number.isFinite(categoryId)) {
        continue;
      }

      const valueCents = normalizeMagnitudeCents(Number(row.total_cents ?? 0));
      if (valueCents <= 0) {
        continue;
      }

      totalByMonthCents[monthIndex] += valueCents;

      const currentBucket = categoryBucketsById.get(categoryId) ?? {
        categoryId,
        rawCategoryName: String(row.category_name ?? '').trim(),
        totalCents: 0,
        monthlyTotalsCents: Array.from({ length: MONTHS_IN_YEAR }, () => 0),
      };
      currentBucket.totalCents += valueCents;
      currentBucket.monthlyTotalsCents[monthIndex] += valueCents;
      categoryBucketsById.set(categoryId, currentBucket);
    }

    const averageMonthsDivisor = this.resolveAverageMonthsDivisor();
    const averageBaseTotalCents = this.resolveAverageBaseTotalCents(totalByMonthCents);
    const categoryBuckets = Array.from(categoryBucketsById.values()).sort((left, right) => {
      const totalComparison = right.totalCents - left.totalCents;
      if (totalComparison !== 0) {
        return totalComparison;
      }

      const leftName = this.translateCategoryName(left.rawCategoryName);
      const rightName = this.translateCategoryName(right.rawCategoryName);
      return leftName.localeCompare(rightName);
    });

    const monthlyTrendSeries: readonly AppLineChartSeries[] = [
      {
        name: this.translate(this.sectionLabelKey()),
        data: totalByMonthCents.map((valueCents) => toAmount(valueCents)),
        themeColor: this.categoryType() === 'expense' ? 'chart-expense' : 'chart-income',
        smooth: true,
        showArea: true,
        areaOpacity: 0.2,
        lineWidth: 2.5,
      },
    ];

    const monthlyByCategorySeries: readonly AppBarChartSeries[] = categoryBuckets.map((bucket) => ({
      name: this.translateCategoryName(bucket.rawCategoryName),
      data: bucket.monthlyTotalsCents.map((valueCents, monthIndex) => {
        const monthTotalCents = totalByMonthCents[monthIndex] ?? 0;
        if (monthTotalCents <= 0) {
          return 0;
        }

        return (valueCents / monthTotalCents) * 100;
      }),
      tooltipValueTextByIndex: bucket.monthlyTotalsCents.map((valueCents) => this.formatCurrencyFromCents(valueCents)),
      color: this.categoryColorHexById.get(bucket.categoryId),
    }));

    const categorySummaries: readonly CategoryBreakdownSummaryItem[] = categoryBuckets.map((bucket) => ({
      categoryId: bucket.categoryId,
      categoryName: this.translateCategoryName(bucket.rawCategoryName),
      totalCents: bucket.totalCents,
      averageMonthlyCents: this.resolveAverageBaseTotalCents(bucket.monthlyTotalsCents) / averageMonthsDivisor,
      icon: this.categoryIconById.get(bucket.categoryId) ?? null,
      colorHex: this.categoryColorHexById.get(bucket.categoryId) ?? null,
    }));

    const yearTotalCents = totalByMonthCents.reduce((sum, valueCents) => sum + valueCents, 0);

    this.averageBaseTotalCents.set(averageBaseTotalCents);
    this.averageMonthsDivisor.set(averageMonthsDivisor);
    this.monthlyLabels.set(monthLabels);
    this.monthlyTrendSeries.set(monthlyTrendSeries);
    this.monthlyByCategorySeries.set(monthlyByCategorySeries);
    this.categorySummaries.set(categorySummaries);
    this.yearTotalCents.set(yearTotalCents);
  }

  private fetchBreakdownRowsByCategoryType(
    payload: AnalyticsFilterPayload,
  ): Promise<{ rows: readonly AnalyticsCategoryByMonthRowDto[] }> {
    return this.categoryType() === 'expense'
      ? this.analyticsService.expensesByCategoryByMonth(payload)
      : this.analyticsService.incomesByCategoryByMonth(payload);
  }

  private translateCategoryName(value: string): string {
    const normalizedValue = value.trim();
    if (normalizedValue.length === 0) {
      return this.translate('overview.cards.recentTransactions.unknownCategory');
    }

    return this.translate(normalizedValue);
  }

  private resolveAverageMonthsDivisor(): number {
    if (!this.shouldUseElapsedMonthsAverage()) {
      return MONTHS_IN_YEAR;
    }

    return Math.max(1, Math.min(MONTHS_IN_YEAR, this.currentDateReference.getMonth() + 1));
  }

  private resolveAverageBaseTotalCents(monthlyTotalsCents: readonly number[]): number {
    if (!this.shouldUseElapsedMonthsAverage()) {
      return monthlyTotalsCents.reduce((sum, totalCents) => sum + Math.max(0, Number(totalCents ?? 0)), 0);
    }

    const lastIncludedMonthIndex = Math.min(MONTHS_IN_YEAR - 1, this.currentDateReference.getMonth());
    let totalCents = 0;

    for (let monthIndex = 0; monthIndex <= lastIncludedMonthIndex; monthIndex += 1) {
      totalCents += Math.max(0, Number(monthlyTotalsCents[monthIndex] ?? 0));
    }

    return totalCents;
  }

  private shouldUseElapsedMonthsAverage(): boolean {
    return this.useElapsedMonthsAverage() && this.year() === this.currentDateReference.getFullYear();
  }

  private resolveLocale(): string | undefined {
    const currentLanguage = this.translateService.getCurrentLang();
    return typeof currentLanguage === 'string' && currentLanguage.trim().length > 0
      ? currentLanguage
      : undefined;
  }

  private translate(key: string, params?: Record<string, unknown>): string {
    const translated = this.translateService.instant(key, params);
    return typeof translated === 'string' ? translated : key;
  }
}
