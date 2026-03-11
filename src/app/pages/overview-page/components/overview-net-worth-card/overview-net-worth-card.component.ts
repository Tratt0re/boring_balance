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
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { NumberFormatService } from '@/services/number-format.service';
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
  readonly netWorthModeChange = output<'valued' | 'ledger'>();

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly totalNetWorthCents = signal(0);
  protected readonly netWorthMode = signal<'valued' | 'ledger'>('ledger');
  protected readonly snapshotRecency = signal<AnalyticsNetWorthSnapshotsDto>(EMPTY_SNAPSHOT_RECENCY);
  protected readonly totalLiquidAssetsCents = signal(0);
  protected readonly totalInvestmentsCents = signal(0);
  protected readonly totalReceivablesCents = signal(0);
  protected readonly totalPayablesCents = signal(0);
  protected readonly showSnapshotAsOfCaption = computed(() =>
    this.netWorthMode() === 'valued'
    && this.snapshotRecency().hasSnapshots
    && this.snapshotRecency().daysSinceLatestSnapshot !== null,
  );
  protected readonly totalAfterReceivablesPayablesCents = computed(
    () => this.totalNetWorthCents() + this.totalReceivablesCents() - this.totalPayablesCents(),
  );

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly localPreferencesService: LocalPreferencesService,
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

  private async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const { from, to } = toMonthRangeTimestamps(this.year(), this.monthIndex());
      const useValuation = this.localPreferencesService.dashboardUseValuationPreference();
      const [netWorthResponse, receivablesPayablesResponse] = await Promise.all([
        this.analyticsService.netWorthByAccount({ useValuation }),
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
      this.netWorthModeChange.emit('ledger');
      this.snapshotRecency.set(EMPTY_SNAPSHOT_RECENCY);
      this.snapshotsChange.emit(EMPTY_SNAPSHOT_RECENCY);
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
    this.totalNetWorthCents.set(Number.isFinite(totalNetWorthCents) ? totalNetWorthCents : totalNetWorthFromRowsCents);
    this.netWorthMode.set(netWorthMode);
    this.netWorthModeChange.emit(netWorthMode);
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
