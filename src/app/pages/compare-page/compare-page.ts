import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { AppBaseCardComponent } from '@/components/base-card';
import { AppDataTableComponent, type TableDataItem } from '@/components/data-table';
import {
  AppBarChartComponent,
  AppRadarChartComponent,
  type AppBarChartSeries,
  type AppRadarChartIndicator,
  type AppRadarChartSeries,
} from '@/components/charts';
import type { AnalyticsCompareMonthsResponse } from '@/dtos';
import { AnalyticsService } from '@/services/analytics.service';
import { CategoriesService } from '@/services/categories.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ZardLoaderComponent } from '@/shared/components/loader';
import { resolveVisualColorHex, toAmount } from '@/pages/overview-page/components/overview-cards.utils';
import {
  CompareYearMonthSelectComponent,
  type CompareYearMonthSelectOption,
} from './components/compare-year-month-select/compare-year-month-select.component';

const COMPARE_YEAR_SELECTOR_MIN_YEAR = 2000;
const MONTHS_IN_YEAR = 12;
const SUMMARY_BAR_CHART_HEIGHT = '20rem';
const RADAR_CHART_HEIGHT = '24rem';
const RADAR_EXPENSE_CATEGORY_LIMIT = 8;

type CompareSide = 'left' | 'right';

interface CompareSummaryMetricItem {
  readonly id: 'incomes' | 'expenses' | 'netCashflow';
  readonly label: string;
  readonly leftCents: number;
  readonly rightCents: number;
}

interface CompareExpenseCategoryTableRow {
  readonly categoryId: number;
  readonly categoryName: string;
  readonly categoryIcon: string | null;
  readonly categoryColorHex: string | null;
  readonly leftAmount: number;
  readonly rightAmount: number;
  readonly deltaAmount: number;
}

@Component({
  selector: 'app-compare-page',
  imports: [
    AppBaseCardComponent,
    AppBarChartComponent,
    AppDataTableComponent,
    AppRadarChartComponent,
    CompareYearMonthSelectComponent,
    TranslatePipe,
    ZardLoaderComponent,
  ],
  templateUrl: './compare-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComparePage implements OnInit, OnDestroy {
  private releaseToolbarActions: (() => void) | null = null;
  private languageChangeSubscription: Subscription | null = null;
  private compareLoadRequestId = 0;
  private categoryColorHexById = new Map<number, string>();
  private categoryIconById = new Map<number, string | null>();
  private readonly languageVersion = signal(0);
  private readonly categoryVisualVersion = signal(0);
  private readonly currentDateReference = new Date();

  protected readonly availableYears = signal<readonly number[]>([]);
  protected readonly leftYear = signal(this.currentDateReference.getFullYear());
  protected readonly leftMonthIndex = signal(this.currentDateReference.getMonth());
  protected readonly rightYear = signal(new Date(
    this.currentDateReference.getFullYear(),
    this.currentDateReference.getMonth() - 1,
    1,
  ).getFullYear());
  protected readonly rightMonthIndex = signal(new Date(
    this.currentDateReference.getFullYear(),
    this.currentDateReference.getMonth() - 1,
    1,
  ).getMonth());
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly compareResponse = signal<AnalyticsCompareMonthsResponse | null>(null);

  protected readonly yearOptions = computed<readonly CompareYearMonthSelectOption[]>(() =>
    this.availableYears().map((year) => ({
      value: String(year),
      label: String(year),
    })),
  );

  protected readonly monthOptions = computed<readonly CompareYearMonthSelectOption[]>(() => {
    this.languageVersion();
    return Array.from({ length: MONTHS_IN_YEAR }, (_, monthIndex) => ({
      value: String(monthIndex),
      label: this.formatMonthOptionLabel(monthIndex),
    }));
  });

  protected readonly leftSnapshot = computed(() => this.compareResponse()?.left ?? null);
  protected readonly rightSnapshot = computed(() => this.compareResponse()?.right ?? null);

  protected readonly leftPeriodLongLabel = computed(() => {
    this.languageVersion();
    const snapshot = this.leftSnapshot();
    if (snapshot) {
      return this.formatPeriodLabel(snapshot.period.year, snapshot.period.month_index, { month: 'long', year: 'numeric' });
    }

    return this.formatPeriodLabel(this.leftYear(), this.leftMonthIndex(), { month: 'long', year: 'numeric' });
  });

  protected readonly rightPeriodLongLabel = computed(() => {
    this.languageVersion();
    const snapshot = this.rightSnapshot();
    if (snapshot) {
      return this.formatPeriodLabel(
        snapshot.period.year,
        snapshot.period.month_index,
        { month: 'long', year: 'numeric' },
      );
    }

    return this.formatPeriodLabel(this.rightYear(), this.rightMonthIndex(), { month: 'long', year: 'numeric' });
  });

  protected readonly leftPeriodShortLabel = computed(() => {
    this.languageVersion();
    const snapshot = this.leftSnapshot();
    if (snapshot) {
      return this.formatPeriodLabel(snapshot.period.year, snapshot.period.month_index, { month: 'short', year: 'numeric' });
    }

    return this.formatPeriodLabel(this.leftYear(), this.leftMonthIndex(), { month: 'short', year: 'numeric' });
  });

  protected readonly rightPeriodShortLabel = computed(() => {
    this.languageVersion();
    const snapshot = this.rightSnapshot();
    if (snapshot) {
      return this.formatPeriodLabel(snapshot.period.year, snapshot.period.month_index, { month: 'short', year: 'numeric' });
    }

    return this.formatPeriodLabel(this.rightYear(), this.rightMonthIndex(), { month: 'short', year: 'numeric' });
  });

  protected readonly summaryMetrics = computed<readonly CompareSummaryMetricItem[]>(() => {
    this.languageVersion();
    const leftSnapshot = this.leftSnapshot();
    const rightSnapshot = this.rightSnapshot();
    const leftTotals = leftSnapshot?.totals;
    const rightTotals = rightSnapshot?.totals;

    const leftIncomesCents = Math.max(0, Number(leftTotals?.incomes_cents ?? 0));
    const rightIncomesCents = Math.max(0, Number(rightTotals?.incomes_cents ?? 0));
    const leftExpensesCents = Math.max(0, Number(leftTotals?.expenses_cents ?? 0));
    const rightExpensesCents = Math.max(0, Number(rightTotals?.expenses_cents ?? 0));
    const leftNetCashflowCents = Number(leftTotals?.net_cashflow_cents ?? 0);
    const rightNetCashflowCents = Number(rightTotals?.net_cashflow_cents ?? 0);

    return [
      {
        id: 'incomes',
        label: this.translate('overview.cards.monthlyTotals.series.incomes'),
        leftCents: leftIncomesCents,
        rightCents: rightIncomesCents,
      },
      {
        id: 'expenses',
        label: this.translate('overview.cards.monthlyTotals.series.expenses'),
        leftCents: leftExpensesCents,
        rightCents: rightExpensesCents,
      },
      {
        id: 'netCashflow',
        label: this.translate('overview.cards.monthlyTotals.series.netCashflow'),
        leftCents: leftNetCashflowCents,
        rightCents: rightNetCashflowCents,
      },
    ] as const;
  });

  protected readonly summaryBarChartLabels = computed<readonly string[]>(() =>
    this.summaryMetrics().map((metric) => metric.label),
  );

  protected readonly summaryBarChartSeries = computed<readonly AppBarChartSeries[]>(() => {
    const metrics = this.summaryMetrics();
    if (metrics.length === 0) {
      return [];
    }

    return [
      {
        name: this.leftPeriodShortLabel(),
        data: metrics.map((metric) => toAmount(metric.leftCents)),
        themeColor: 'chart-5',
      },
      {
        name: this.rightPeriodShortLabel(),
        data: metrics.map((metric) => toAmount(metric.rightCents)),
        themeColor: 'chart-7',
      },
    ] as const;
  });

  protected readonly summaryChartCurrencyCode = computed(() => this.localPreferencesService.currencyPreference());

  protected readonly expenseRadarRows = computed<readonly CompareExpenseCategoryTableRow[]>(() =>
    this.expenseCategoryTableRows().slice(0, RADAR_EXPENSE_CATEGORY_LIMIT),
  );

  protected readonly radarIndicators = computed<readonly AppRadarChartIndicator[]>(() => {
    const rows = this.expenseRadarRows();

    return rows.map((row) => {
      const maximum = Math.max(0, row.leftAmount, row.rightAmount);
      const paddedMax = maximum > 0 ? maximum * 1.12 : 1;

      return {
        name: row.categoryName,
        min: 0,
        max: paddedMax,
      };
    });
  });

  protected readonly radarSeries = computed<readonly AppRadarChartSeries[]>(() => {
    this.languageVersion();
    const rows = this.expenseRadarRows();
    if (rows.length === 0) {
      return [];
    }

    return [
      {
        name: this.leftPeriodShortLabel(),
        value: rows.map((row) => row.leftAmount),
        themeColor: 'chart-5',
        showArea: true,
        areaOpacity: 0.1,
      },
      {
        name: this.rightPeriodShortLabel(),
        value: rows.map((row) => row.rightAmount),
        themeColor: 'chart-7',
        showArea: true,
        areaOpacity: 0.16,
      },
    ] as const;
  });

  protected readonly expenseCategoryTableRows = computed<readonly CompareExpenseCategoryTableRow[]>(() => {
    this.languageVersion();
    this.categoryVisualVersion();
    const leftSnapshot = this.leftSnapshot();
    const rightSnapshot = this.rightSnapshot();
    const leftRows = leftSnapshot?.expenses_by_category ?? [];
    const rightRows = rightSnapshot?.expenses_by_category ?? [];

    const rowByCategoryId = new Map<number, CompareExpenseCategoryTableRow>();
    const upsertRow = (
      categoryId: number,
      categoryName: string,
      amountCents: number,
      targetColumn: 'leftAmount' | 'rightAmount',
    ): void => {
      const existing = rowByCategoryId.get(categoryId);
      if (existing) {
        const nextLeftAmount = targetColumn === 'leftAmount' ? toAmount(amountCents) : existing.leftAmount;
        const nextRightAmount = targetColumn === 'rightAmount' ? toAmount(amountCents) : existing.rightAmount;
        rowByCategoryId.set(categoryId, {
          ...existing,
          [targetColumn]: targetColumn === 'leftAmount' ? nextLeftAmount : nextRightAmount,
          deltaAmount: nextLeftAmount - nextRightAmount,
          categoryName: existing.categoryName || this.resolveCategoryLabel(categoryName),
        });
        return;
      }

      const leftAmount = targetColumn === 'leftAmount' ? toAmount(amountCents) : 0;
      const rightAmount = targetColumn === 'rightAmount' ? toAmount(amountCents) : 0;
      rowByCategoryId.set(categoryId, {
        categoryId,
        categoryName: this.resolveCategoryLabel(categoryName),
        categoryIcon: this.categoryIconById.get(categoryId) ?? null,
        categoryColorHex: this.categoryColorHexById.get(categoryId) ?? null,
        leftAmount,
        rightAmount,
        deltaAmount: leftAmount - rightAmount,
      });
    };

    for (const row of leftRows) {
      upsertRow(Number(row.category_id), String(row.category_name ?? ''), Number(row.amount_cents ?? 0), 'leftAmount');
    }

    for (const row of rightRows) {
      upsertRow(Number(row.category_id), String(row.category_name ?? ''), Number(row.amount_cents ?? 0), 'rightAmount');
    }

    return Array.from(rowByCategoryId.values()).sort((left, right) => {
      const maxAmountComparison =
        Math.max(right.leftAmount, right.rightAmount) - Math.max(left.leftAmount, left.rightAmount);
      if (maxAmountComparison !== 0) {
        return maxAmountComparison;
      }

      return left.categoryName.localeCompare(right.categoryName);
    });
  });

  protected readonly expenseCategoryTableStructure = computed<readonly TableDataItem[]>(() => {
    this.languageVersion();
    return [
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
        columnName: this.leftPeriodShortLabel(),
        columnKey: 'leftAmount',
        type: 'currency',
        align: 'right',
        sortable: true,
        currency: {
          modality: 'none',
        },
      },
      {
        columnName: this.rightPeriodShortLabel(),
        columnKey: 'rightAmount',
        type: 'currency',
        align: 'right',
        sortable: true,
        currency: {
          modality: 'none',
        },
      },
      {
        columnName: 'compare.metrics.delta',
        columnKey: 'deltaAmount',
        type: 'currency',
        align: 'right',
        sortable: true,
        currency: {
          modality: 'none',
        },
      },
    ] as const;
  });

  protected readonly hasComparisonData = computed(() => this.compareResponse() !== null);

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly categoriesService: CategoriesService,
    private readonly localPreferencesService: LocalPreferencesService,
    private readonly toolbarContextService: ToolbarContextService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.compare',
      itemActions: [],
    });
    this.languageChangeSubscription = this.translateService.onLangChange.subscribe(() => {
      this.languageVersion.update((currentValue) => currentValue + 1);
    });

    void this.initializePage();
  }

  ngOnDestroy(): void {
    this.languageChangeSubscription?.unsubscribe();
    this.languageChangeSubscription = null;
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
  }

  protected onYearSelectionChange(side: CompareSide, nextYear: number): void {
    if (!this.availableYears().includes(nextYear)) {
      return;
    }

    const yearSignal = side === 'left' ? this.leftYear : this.rightYear;
    if (nextYear === yearSignal()) {
      return;
    }

    yearSignal.set(nextYear);
    void this.loadComparison();
  }

  protected onMonthSelectionChange(side: CompareSide, nextMonthIndex: number): void {
    if (!Number.isInteger(nextMonthIndex) || nextMonthIndex < 0 || nextMonthIndex >= MONTHS_IN_YEAR) {
      return;
    }

    const monthSignal = side === 'left' ? this.leftMonthIndex : this.rightMonthIndex;
    if (nextMonthIndex === monthSignal()) {
      return;
    }

    monthSignal.set(nextMonthIndex);
    void this.loadComparison();
  }

  private async initializePage(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    await Promise.all([
      this.loadAvailableYears(),
      this.loadCategoryVisuals(),
    ]);

    this.initializeDefaultSelections();
    await this.loadComparison();
  }

  private async loadAvailableYears(): Promise<void> {
    try {
      const years = await this.analyticsService.availableYears();
      const normalizedYears = years
        .filter((year) => Number.isInteger(year))
        .filter((year) => year >= COMPARE_YEAR_SELECTOR_MIN_YEAR)
        .sort((left, right) => right - left);

      if (normalizedYears.length > 0) {
        this.availableYears.set(normalizedYears);
        return;
      }
    } catch (error) {
      console.warn('[compare-page] Failed to load available years:', error);
    }

    this.availableYears.set([this.currentDateReference.getFullYear()]);
  }

  private async loadCategoryVisuals(): Promise<void> {
    try {
      const categories = await this.categoriesService.listAll();
      this.categoryIconById = new Map(categories.map((category) => [category.id, category.icon] as const));
      this.categoryColorHexById = new Map(
        categories.map((category) => [category.id, resolveVisualColorHex(category.colorKey)] as const),
      );
      this.categoryVisualVersion.update((currentValue) => currentValue + 1);
    } catch (error) {
      console.warn('[compare-page] Failed to load category visuals:', error);
      this.categoryIconById = new Map();
      this.categoryColorHexById = new Map();
      this.categoryVisualVersion.update((currentValue) => currentValue + 1);
    }
  }

  private initializeDefaultSelections(): void {
    const years = this.availableYears();
    const fallbackYear = years[0] ?? this.currentDateReference.getFullYear();
    const currentYear = this.currentDateReference.getFullYear();
    const currentMonthIndex = this.currentDateReference.getMonth();
    const previousMonthDate = new Date(currentYear, currentMonthIndex - 1, 1);
    const previousYear = previousMonthDate.getFullYear();
    const previousMonthIndex = previousMonthDate.getMonth();

    this.leftYear.set(years.includes(currentYear) ? currentYear : fallbackYear);
    this.leftMonthIndex.set(currentMonthIndex);
    this.rightYear.set(years.includes(previousYear) ? previousYear : this.leftYear());
    this.rightMonthIndex.set(previousMonthIndex);
  }

  private async loadComparison(): Promise<void> {
    const requestId = ++this.compareLoadRequestId;
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const response = await this.analyticsService.compareMonths({
        left: {
          year: this.leftYear(),
          month_index: this.leftMonthIndex(),
        },
        right: {
          year: this.rightYear(),
          month_index: this.rightMonthIndex(),
        },
      });

      if (requestId !== this.compareLoadRequestId) {
        return;
      }

      this.compareResponse.set(response);
    } catch (error) {
      if (requestId !== this.compareLoadRequestId) {
        return;
      }

      console.error('[compare-page] Failed to load compare analytics:', error);
      this.compareResponse.set(null);
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading compare analytics.');
    } finally {
      if (requestId === this.compareLoadRequestId) {
        this.isLoading.set(false);
      }
    }
  }

  private formatMonthOptionLabel(monthIndex: number): string {
    try {
      return new Intl.DateTimeFormat(this.resolveLocale(), {
        month: 'long',
      }).format(new Date(2000, monthIndex, 1));
    } catch {
      return new Intl.DateTimeFormat(undefined, {
        month: 'long',
      }).format(new Date(2000, monthIndex, 1));
    }
  }

  private formatPeriodLabel(
    year: number,
    monthIndex: number,
    options: Intl.DateTimeFormatOptions,
  ): string {
    try {
      return new Intl.DateTimeFormat(this.resolveLocale(), options).format(new Date(year, monthIndex, 1));
    } catch {
      return new Intl.DateTimeFormat(undefined, options).format(new Date(year, monthIndex, 1));
    }
  }

  private resolveLocale(): string | undefined {
    const currentLanguage = this.translateService.getCurrentLang();
    return typeof currentLanguage === 'string' && currentLanguage.trim().length > 0 ? currentLanguage : undefined;
  }

  private resolveCategoryLabel(categoryName: string): string {
    const normalizedCategoryName = typeof categoryName === 'string' ? categoryName.trim() : '';
    if (normalizedCategoryName.length === 0) {
      return categoryName;
    }

    return this.translate(normalizedCategoryName);
  }

  private translate(key: string, params?: Record<string, unknown>): string {
    const translated = this.translateService.instant(key, params);
    return typeof translated === 'string' ? translated : key;
  }

  protected readonly summaryBarChartHeight = SUMMARY_BAR_CHART_HEIGHT;
  protected readonly radarChartHeight = RADAR_CHART_HEIGHT;
}
