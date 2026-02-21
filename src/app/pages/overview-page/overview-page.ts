import { Component, OnDestroy, OnInit, signal } from '@angular/core';

import { AppBaseCardComponent } from '@/components/base-card';
import { AppBarChartComponent, type AppBarChartSeries } from '@/components/charts';
import { AnalyticsService } from '@/services/analytics.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ZardLoaderComponent } from '@/shared/components/loader';

const AMOUNT_CENTS_DIVISOR = 100;

function formatMonthLabel(monthKey: string): string {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number.parseInt(yearText ?? '', 10);
  const month = Number.parseInt(monthText ?? '', 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return monthKey;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    year: '2-digit',
  }).format(new Date(year, month - 1, 1));
}

function toAmount(amountCents: number): number {
  return amountCents / AMOUNT_CENTS_DIVISOR;
}

function toAbsoluteAmount(amountCents: number): number {
  return Math.abs(amountCents) / AMOUNT_CENTS_DIVISOR;
}

@Component({
  selector: 'app-overview-page',
  imports: [AppBaseCardComponent, AppBarChartComponent, ZardLoaderComponent],
  templateUrl: './overview-page.html',
})
export class OverviewPage implements OnInit, OnDestroy {
  private releaseToolbarActions: (() => void) | null = null;
  protected readonly isMonthlyTotalsLoading = signal(true);
  protected readonly monthlyTotalsLoadError = signal<string | null>(null);
  protected monthlyTotalsLabels: readonly string[] = [];
  protected monthlyTotalsBarSeries: readonly AppBarChartSeries[] = [
    {
      name: 'Incomes',
      data: [],
      themeColor: 'chart-2',
    },
    {
      name: 'Expenses',
      data: [],
      themeColor: 'chart-1',
    },
    {
      name: 'Profit',
      data: [],
      themeColor: 'chart-3',
    },
  ];

  constructor(
    private readonly toolbarContextService: ToolbarContextService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  ngOnInit(): void {
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.overview',
      actions: [],
    });
    void this.loadExpensesIncomesProfitByMonth();
  }

  ngOnDestroy(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
  }

  private async loadExpensesIncomesProfitByMonth(): Promise<void> {
    this.isMonthlyTotalsLoading.set(true);
    this.monthlyTotalsLoadError.set(null);

    try {
      const response = await this.analyticsService.expensesIncomesProfitByMonth();
      const rows = response.rows;

      this.monthlyTotalsLabels = rows.map((row) => formatMonthLabel(row.month));
      this.monthlyTotalsBarSeries = [
        {
          name: 'Incomes',
          data: rows.map((row) => toAmount(row.incomes_cents)),
          themeColor: 'chart-2',
        },
        {
          name: 'Expenses',
          data: rows.map((row) => toAbsoluteAmount(row.expenses_cents)),
          themeColor: 'chart-1',
        },
        {
          name: 'Profit',
          data: rows.map((row) => toAmount(row.profit_cents)),
          themeColor: 'chart-3',
        },
      ];
    } catch (error) {
      console.error('[overview-page] Failed to load monthly analytics:', error);
      this.monthlyTotalsLoadError.set(
        error instanceof Error ? error.message : 'Unexpected error while loading analytics.',
      );
    } finally {
      this.isMonthlyTotalsLoading.set(false);
    }
  }
}
