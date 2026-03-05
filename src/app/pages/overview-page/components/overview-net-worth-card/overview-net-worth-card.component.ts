import {
  ChangeDetectionStrategy,
  Component,
  OnChanges,
  OnInit,
  SimpleChanges,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AppBaseCardComponent } from '@/components/base-card';
import type {
  AnalyticsNetWorthByAccountResponse,
  AnalyticsNetWorthByAccountRowDto,
  AnalyticsNetWorthSnapshotsDto,
} from '@/dtos';
import { AnalyticsService } from '@/services/analytics.service';
import { NumberFormatService } from '@/services/number-format.service';
import { type ZardIcon, ZardIconComponent } from '@/shared/components/icon';
import { ZardLoaderComponent } from '@/shared/components/loader';
import { toMonthRangeTimestamps } from '../overview-cards.utils';

const AMOUNT_CENTS_DIVISOR = 100;
const EMPTY_SNAPSHOT_RECENCY: AnalyticsNetWorthSnapshotsDto = {
  hasSnapshots: false,
  latestSnapshotAtMs: null,
  daysSinceLatestSnapshot: null,
  isOutdated: false,
};
const LIQUID_ACCOUNT_TYPES = new Set(['cash', 'bank', 'savings']);
const INVESTMENT_ACCOUNT_TYPES = new Set(['brokerage', 'crypto']);

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
  readonly snapshotsChange = output<AnalyticsNetWorthSnapshotsDto>();

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly totalNetWorthCents = signal(0);
  protected readonly netWorthMode = signal<'valued' | 'ledger'>('ledger');
  protected readonly snapshotRecency = signal<AnalyticsNetWorthSnapshotsDto>(EMPTY_SNAPSHOT_RECENCY);
  protected readonly totalNetWorthPreviousMonthTotalCents = signal(0);
  protected readonly totalNetWorthPreviousMonthDeltaCents = signal(0);
  protected readonly totalLiquidAssetsCents = signal(0);
  protected readonly totalInvestmentsCents = signal(0);
  protected readonly totalReceivablesCents = signal(0);
  protected readonly totalPayablesCents = signal(0);
  protected readonly showSnapshotAsOfCaption = computed(() =>
    this.netWorthMode() === 'valued'
    && this.snapshotRecency().hasSnapshots
    && this.snapshotRecency().daysSinceLatestSnapshot !== null,
  );
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
      this.netWorthMode.set('ledger');
      this.snapshotRecency.set(EMPTY_SNAPSHOT_RECENCY);
      this.snapshotsChange.emit(EMPTY_SNAPSHOT_RECENCY);
      this.totalNetWorthPreviousMonthTotalCents.set(0);
      this.totalNetWorthPreviousMonthDeltaCents.set(0);
      this.totalLiquidAssetsCents.set(0);
      this.totalInvestmentsCents.set(0);
      this.totalReceivablesCents.set(0);
      this.totalPayablesCents.set(0);
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading summary cards.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private applyNetWorthResponse(netWorthResponse: AnalyticsNetWorthByAccountResponse): void {
    const totalNetWorthFromRowsCents = netWorthResponse.rows.reduce(
      (total, row) => total + Number(row.net_worth_cents ?? 0),
      0,
    );
    const totalNetWorthCents = Number(netWorthResponse.netWorthCents ?? totalNetWorthFromRowsCents);
    const netWorthMode = netWorthResponse.netWorthMode === 'valued' ? 'valued' : 'ledger';
    const useValuedBalances = netWorthMode === 'valued';
    const liquidAssetsCentsFallback = this.sumRowsByAccountTypes(
      netWorthResponse.rows,
      LIQUID_ACCOUNT_TYPES,
      useValuedBalances,
    );
    const investmentsCentsFallback = this.sumRowsByAccountTypes(
      netWorthResponse.rows,
      INVESTMENT_ACCOUNT_TYPES,
      useValuedBalances,
    );
    const liquidAssetsCents = Number(netWorthResponse.liquidAssetsCents ?? liquidAssetsCentsFallback);
    const investmentsCents = Number(netWorthResponse.investmentsCents ?? investmentsCentsFallback);
    const snapshots = netWorthResponse.snapshots ?? EMPTY_SNAPSHOT_RECENCY;
    const normalizedDaysSinceLatestSnapshot = snapshots.daysSinceLatestSnapshot === null
      ? null
      : Number(snapshots.daysSinceLatestSnapshot);
    const previousMonthDeltaCents = Number(netWorthResponse.totals?.previous_month_delta_cents ?? 0);
    this.totalNetWorthCents.set(Number.isFinite(totalNetWorthCents) ? totalNetWorthCents : totalNetWorthFromRowsCents);
    this.netWorthMode.set(netWorthMode);
    const normalizedSnapshotRecency: AnalyticsNetWorthSnapshotsDto = {
      hasSnapshots: snapshots.hasSnapshots === true,
      latestSnapshotAtMs: snapshots.latestSnapshotAtMs === null ? null : Number(snapshots.latestSnapshotAtMs),
      daysSinceLatestSnapshot: normalizedDaysSinceLatestSnapshot !== null && Number.isFinite(normalizedDaysSinceLatestSnapshot)
        ? normalizedDaysSinceLatestSnapshot
        : null,
      isOutdated: snapshots.isOutdated === true,
    };
    this.snapshotRecency.set(normalizedSnapshotRecency);
    this.snapshotsChange.emit(normalizedSnapshotRecency);
    this.totalNetWorthPreviousMonthTotalCents.set(Number(netWorthResponse.totals?.previous_month_total_cents ?? 0));
    this.totalNetWorthPreviousMonthDeltaCents.set(Number.isFinite(previousMonthDeltaCents) ? previousMonthDeltaCents : 0);
    this.totalLiquidAssetsCents.set(Number.isFinite(liquidAssetsCents) ? liquidAssetsCents : liquidAssetsCentsFallback);
    this.totalInvestmentsCents.set(Number.isFinite(investmentsCents) ? investmentsCents : investmentsCentsFallback);
  }

  private sumRowsByAccountTypes(
    rows: readonly AnalyticsNetWorthByAccountRowDto[],
    accountTypes: ReadonlySet<string>,
    useValuedBalances: boolean,
  ): number {
    return rows.reduce((totalCents, row) => {
      if (!accountTypes.has(String(row.account_type ?? ''))) {
        return totalCents;
      }

      const ledgerCents = Number(row.net_worth_cents ?? 0);
      const valuedCents = row.net_worth_valued_cents === null || row.net_worth_valued_cents === undefined
        ? ledgerCents
        : Number(row.net_worth_valued_cents);
      const effectiveCents = useValuedBalances && Number.isFinite(valuedCents)
        ? valuedCents
        : ledgerCents;

      return totalCents + (Number.isFinite(effectiveCents) ? effectiveCents : 0);
    }, 0);
  }
}
