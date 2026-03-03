import {
  ChangeDetectionStrategy,
  Component,
  OnChanges,
  OnInit,
  SimpleChanges,
  computed,
  input,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AppBaseCardComponent } from '@/components/base-card';
import type { AnalyticsNetWorthByAccountResponse } from '@/dtos';
import { AnalyticsService } from '@/services/analytics.service';
import { NumberFormatService } from '@/services/number-format.service';
import { type ZardIcon, ZardIconComponent } from '@/shared/components/icon';
import { ZardLoaderComponent } from '@/shared/components/loader';
import { toMonthRangeTimestamps } from '../overview-cards.utils';

const AMOUNT_CENTS_DIVISOR = 100;

@Component({
  selector: 'app-overview-net-worth-card',
  imports: [
    AppBaseCardComponent,
    TranslatePipe,
    ZardIconComponent,
    ZardLoaderComponent,
  ],
  templateUrl: './overview-net-worth-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class OverviewNetWorthCardComponent implements OnInit, OnChanges {
  readonly year = input(new Date().getFullYear());
  readonly monthIndex = input(new Date().getMonth());

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
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

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly numberFormatService: NumberFormatService,
  ) {}

  ngOnInit(): void {
    void this.loadData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const yearChange = changes['year'];
    const monthIndexChange = changes['monthIndex'];
    if ((yearChange && !yearChange.firstChange) || (monthIndexChange && !monthIndexChange.firstChange)) {
      void this.loadData();
    }
  }

  async reload(): Promise<void> {
    await this.loadData();
  }

  protected formatCurrencyFromCents(amountCents: number): string {
    const amount = amountCents / AMOUNT_CENTS_DIVISOR;
    return this.numberFormatService.formatCurrency(amount);
  }

  protected formatPercent(value: number): string {
    const normalizedValue = Number.isFinite(value) ? Math.abs(value) : 0;
    return this.numberFormatService.formatPercent(normalizedValue, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const { from, to } = toMonthRangeTimestamps(this.year(), this.monthIndex());
      const [netWorthResponse, receivablesPayablesResponse] = await Promise.all([
        this.analyticsService.netWorthByAccount(),
        this.analyticsService.receivablesPayables({
          filters: {
            from,
            to,
          },
        }),
      ]);

      this.applyNetWorthResponse(netWorthResponse);
      this.totalReceivablesCents.set(Number(receivablesPayablesResponse.totals?.receivables_cents ?? 0));
      this.totalPayablesCents.set(Number(receivablesPayablesResponse.totals?.payables_cents ?? 0));
    } catch (error) {
      console.error('[overview-net-worth-card] Failed to load net worth card data:', error);
      this.totalNetWorthCents.set(0);
      this.totalNetWorthPreviousMonthTotalCents.set(0);
      this.totalNetWorthPreviousMonthDeltaCents.set(0);
      this.totalReceivablesCents.set(0);
      this.totalPayablesCents.set(0);
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading summary cards.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private applyNetWorthResponse(netWorthResponse: AnalyticsNetWorthByAccountResponse): void {
    const totalNetWorthCents = netWorthResponse.rows.reduce((total, row) => total + Number(row.net_worth_cents ?? 0), 0);
    const previousMonthDeltaCents = Number(netWorthResponse.totals?.previous_month_delta_cents ?? 0);
    this.totalNetWorthCents.set(totalNetWorthCents);
    this.totalNetWorthPreviousMonthTotalCents.set(Number(netWorthResponse.totals?.previous_month_total_cents ?? 0));
    this.totalNetWorthPreviousMonthDeltaCents.set(Number.isFinite(previousMonthDeltaCents) ? previousMonthDeltaCents : 0);
  }
}
