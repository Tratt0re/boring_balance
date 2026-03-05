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
import { type AppPieChartItem, AppPieChartComponent, resolveChartCssColor } from '@/components/charts';
import { DEFAULT_VISUAL_COLOR_KEY } from '@/config/visual-options.config';
import type { AnalyticsNetWorthByAccountResponse } from '@/dtos';
import { AccountsService } from '@/services/accounts.service';
import { AnalyticsService } from '@/services/analytics.service';
import { NumberFormatService } from '@/services/number-format.service';
import { ZardLoaderComponent } from '@/shared/components/loader';
import {
  NET_WORTH_PIE_OTHERS_THRESHOLD,
  resolveVisualColorHex,
  toPercent,
} from '../overview-cards.utils';

const AMOUNT_CENTS_DIVISOR = 100;
const ALLOCATION_PIE_CHART_HEIGHT_DESKTOP = '13rem';
const ALLOCATION_PIE_CHART_HEIGHT_MOBILE = '15rem';

interface NetWorthDistributionEntry {
  readonly accountId: number;
  readonly accountName: string;
  readonly accountType: string;
  readonly netWorthCents: number;
  readonly netWorthLedgerCents: number;
  readonly netWorthValuedCents: number | null;
  readonly absoluteCents: number;
}

@Component({
  selector: 'app-overview-allocation-card',
  imports: [
    AppBaseCardComponent,
    AppPieChartComponent,
    TranslatePipe,
    ZardLoaderComponent,
  ],
  templateUrl: './overview-allocation-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class OverviewAllocationCardComponent implements OnInit, OnDestroy, OnChanges {
  private languageChangeSubscription: Subscription | null = null;
  private accountColorHexById = new Map<number, string>();
  private netWorthResponseCache: AnalyticsNetWorthByAccountResponse | null = null;

  readonly year = input(new Date().getFullYear());
  readonly monthIndex = input(new Date().getMonth());
  readonly isSmallScreen = input(false);
  readonly groupSmallSegments = input(true);
  readonly minPercentForGrouping = input(NET_WORTH_PIE_OTHERS_THRESHOLD);

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly distributionPieItems = signal<readonly AppPieChartItem[]>([]);
  protected readonly pieChartHeight = computed(() =>
    this.isSmallScreen() ? ALLOCATION_PIE_CHART_HEIGHT_MOBILE : ALLOCATION_PIE_CHART_HEIGHT_DESKTOP,
  );

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly accountsService: AccountsService,
    private readonly numberFormatService: NumberFormatService,
    private readonly translateService: TranslateService,
  ) {
    effect(() => {
      this.numberFormatService.currencySymbol();
      this.numberFormatService.currencyFormatStyle();

      if (this.netWorthResponseCache) {
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
    const groupingChange = changes['groupSmallSegments'];
    const thresholdChange = changes['minPercentForGrouping'];
    if (
      (yearChange && !yearChange.firstChange) ||
      (monthIndexChange && !monthIndexChange.firstChange) ||
      (groupingChange && !groupingChange.firstChange) ||
      (thresholdChange && !thresholdChange.firstChange)
    ) {
      if (groupingChange || thresholdChange) {
        this.rebuildLocalizedViewModel();
        return;
      }

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
      const [netWorthResponse, accounts] = await Promise.all([
        this.analyticsService.netWorthByAccount(),
        this.accountsService.listAll().catch((error) => {
          console.warn('[overview-allocation-card] Failed to load account colors for allocation chart:', error);
          return [];
        }),
      ]);

      this.accountColorHexById = new Map(
        accounts.map((account) => [account.id, resolveVisualColorHex(account.colorKey)] as const),
      );
      this.netWorthResponseCache = netWorthResponse;
      this.applyNetWorthResponse(netWorthResponse);
    } catch (error) {
      console.error('[overview-allocation-card] Failed to load allocation card data:', error);
      this.accountColorHexById = new Map();
      this.netWorthResponseCache = null;
      this.distributionPieItems.set([]);
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading allocation.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private rebuildLocalizedViewModel(): void {
    if (!this.netWorthResponseCache) {
      return;
    }

    this.applyNetWorthResponse(this.netWorthResponseCache);
  }

  private applyNetWorthResponse(netWorthResponse: AnalyticsNetWorthByAccountResponse): void {
    const useValuedMode = netWorthResponse.netWorthMode === 'valued';
    const distributionEntries: NetWorthDistributionEntry[] = netWorthResponse.rows
      .map((row) => {
        const netWorthLedgerCents = Number(row.net_worth_cents ?? 0);
        const valuedCents = row.net_worth_valued_cents;
        const netWorthValuedCents = valuedCents === null || valuedCents === undefined
          ? null
          : Number(valuedCents);
        const netWorthCents = useValuedMode
          ? (netWorthValuedCents !== null && Number.isFinite(netWorthValuedCents)
              ? netWorthValuedCents
              : netWorthLedgerCents)
          : netWorthLedgerCents;
        const absoluteCents = Math.abs(netWorthCents);

        return {
          accountId: Number(row.account_id),
          accountName: row.account_name,
          accountType: String(row.account_type ?? ''),
          netWorthCents,
          netWorthLedgerCents,
          netWorthValuedCents: netWorthValuedCents !== null && Number.isFinite(netWorthValuedCents)
            ? netWorthValuedCents
            : null,
          absoluteCents,
        };
      })
      .filter((entry) => entry.absoluteCents > 0);

    const totalAbsoluteCents = distributionEntries.reduce((total, entry) => total + entry.absoluteCents, 0);
    if (totalAbsoluteCents <= 0) {
      this.distributionPieItems.set([]);
      return;
    }

    const requestedGroupingThreshold = Number(this.minPercentForGrouping());
    const groupingThreshold = Number.isFinite(requestedGroupingThreshold)
      ? Math.max(0, Math.min(1, requestedGroupingThreshold))
      : NET_WORTH_PIE_OTHERS_THRESHOLD;
    const shouldGroupSmallSegments = this.groupSmallSegments();
    const majorEntries = shouldGroupSmallSegments
      ? distributionEntries.filter((entry) => entry.absoluteCents / totalAbsoluteCents >= groupingThreshold)
      : distributionEntries;
    const minorEntries = shouldGroupSmallSegments
      ? distributionEntries.filter((entry) => entry.absoluteCents / totalAbsoluteCents < groupingThreshold)
      : [];

    const distributionPieItems: AppPieChartItem[] = majorEntries.map((entry) => ({
      name: entry.accountName,
      value: toPercent(entry.absoluteCents, totalAbsoluteCents),
      color: this.accountColorHexById.get(entry.accountId),
      tooltipValueText: this.formatCurrencyFromCents(entry.netWorthCents),
      tooltipDetails: this.buildValuationTooltipDetails(entry),
    }));

    if (minorEntries.length > 0) {
      const othersAbsoluteCents = minorEntries.reduce((total, entry) => total + entry.absoluteCents, 0);
      const tooltipDetails = minorEntries
        .slice()
        .sort((left, right) => right.absoluteCents - left.absoluteCents || left.accountName.localeCompare(right.accountName))
        .map((entry) => `• ${entry.accountName}: ${this.formatCurrencyFromCents(entry.netWorthCents)}`);

      distributionPieItems.push({
        name: this.translate('overview.pie.others'),
        value: toPercent(othersAbsoluteCents, totalAbsoluteCents),
        color: resolveChartCssColor(`--${DEFAULT_VISUAL_COLOR_KEY}`, '#9ca3af'),
        tooltipValueText: this.formatCurrencyFromCents(othersAbsoluteCents),
        tooltipDetails,
      });
    }

    this.distributionPieItems.set(distributionPieItems);
  }

  private formatCurrencyFromCents(amountCents: number): string {
    const amount = amountCents / AMOUNT_CENTS_DIVISOR;
    return this.numberFormatService.formatCurrency(amount);
  }

  private buildValuationTooltipDetails(entry: NetWorthDistributionEntry): readonly string[] | undefined {
    if (!this.isValuationTooltipAccountType(entry.accountType) || entry.netWorthValuedCents === null) {
      return undefined;
    }

    return [
      `${this.translate('overview.cards.netWorth.tooltips.current')}: ${this.formatCurrencyFromCents(entry.netWorthLedgerCents)}`,
      `${this.translate('overview.cards.netWorth.withValuations')}: ${this.formatCurrencyFromCents(entry.netWorthValuedCents)}`,
    ];
  }

  private isValuationTooltipAccountType(accountType: string): boolean {
    return accountType === 'brokerage' || accountType === 'crypto';
  }

  private translate(key: string, params?: Record<string, unknown>): string {
    const translated = this.translateService.instant(key, params);
    return typeof translated === 'string' ? translated : key;
  }
}
