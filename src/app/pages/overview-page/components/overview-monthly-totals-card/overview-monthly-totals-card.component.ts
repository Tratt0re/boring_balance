import {
  ChangeDetectionStrategy,
  Component,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  computed,
  input,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { AppBaseCardComponent } from '@/components/base-card';
import { type AppBarChartSeries, AppBarChartComponent } from '@/components/charts';
import { AnalyticsService } from '@/services/analytics.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { ZardLoaderComponent } from '@/shared/components/loader';
import { formatMonthLabel, toAbsoluteAmount, toAmount, toYearRangeTimestamps } from '../overview-cards.utils';

const MONTHLY_TOTALS_BAR_CHART_HEIGHT_DESKTOP = '15rem';
const MONTHLY_TOTALS_BAR_CHART_HEIGHT_MOBILE = '18rem';

@Component({
  selector: 'app-overview-monthly-totals-card',
  imports: [
    AppBaseCardComponent,
    AppBarChartComponent,
    TranslatePipe,
    ZardLoaderComponent,
  ],
  templateUrl: './overview-monthly-totals-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class OverviewMonthlyTotalsCardComponent implements OnInit, OnDestroy, OnChanges {
  private languageChangeSubscription: Subscription | null = null;
  private rowsCache: ReadonlyArray<{
    month: string;
    incomes_cents: number;
    expenses_cents: number;
    net_cashflow_cents: number;
  }> = [];

  readonly year = input(new Date().getFullYear());
  readonly isSmallScreen = input(false);

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly labels = signal<readonly string[]>([]);
  protected readonly series = signal<readonly AppBarChartSeries[]>([]);
  protected readonly chartHeight = computed(() =>
    this.isSmallScreen() ? MONTHLY_TOTALS_BAR_CHART_HEIGHT_MOBILE : MONTHLY_TOTALS_BAR_CHART_HEIGHT_DESKTOP,
  );
  protected readonly currencyCode = computed(() => this.localPreferencesService.currencyPreference());

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly localPreferencesService: LocalPreferencesService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    this.series.set(this.buildMonthlyTotalsBarSeries([]));
    this.languageChangeSubscription = this.translateService.onLangChange.subscribe(() => {
      this.rebuildLocalizedViewModel();
    });
    void this.loadData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const yearChange = changes['year'];
    if (yearChange && !yearChange.firstChange) {
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

  private async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const { from, to } = toYearRangeTimestamps(this.year());
      const response = await this.analyticsService.expensesIncomesNetCashflowByMonth({
        filters: { from, to },
      });
      const rows = response.rows;
      this.rowsCache = rows;
      this.labels.set(rows.map((row) => formatMonthLabel(row.month, this.resolveLocale())));
      this.series.set(this.buildMonthlyTotalsBarSeries(rows));
    } catch (error) {
      console.error('[overview-monthly-totals-card] Failed to load monthly analytics:', error);
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading analytics.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private rebuildLocalizedViewModel(): void {
    const rows = this.rowsCache;
    if (rows.length === 0) {
      this.series.set(this.buildMonthlyTotalsBarSeries([]));
      return;
    }

    this.labels.set(rows.map((row) => formatMonthLabel(row.month, this.resolveLocale())));
    this.series.set(this.buildMonthlyTotalsBarSeries(rows));
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
