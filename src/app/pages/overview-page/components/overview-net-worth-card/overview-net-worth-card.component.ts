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
import { type AppBarChartSeries, AppBarChartComponent, resolveChartCssColor } from '@/components/charts';
import { DEFAULT_VISUAL_COLOR_KEY } from '@/config/visual-options.config';
import type { AnalyticsNetWorthByAccountResponse } from '@/dtos';
import { AccountsService } from '@/services/accounts.service';
import { AnalyticsService } from '@/services/analytics.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { type ZardIcon, ZardIconComponent } from '@/shared/components/icon';
import { ZardLoaderComponent } from '@/shared/components/loader';
import { ZardTooltipImports } from '@/shared/components/tooltip';
import {
  NET_WORTH_PIE_OTHERS_THRESHOLD,
  resolveVisualColorHex,
  toMonthRangeTimestamps,
  toPercent,
} from '../overview-cards.utils';

const AMOUNT_CENTS_DIVISOR = 100;
const NET_WORTH_DISTRIBUTION_BAR_HEIGHT_DESKTOP = '15rem';
const NET_WORTH_DISTRIBUTION_BAR_HEIGHT_MOBILE = '20rem';

interface NetWorthDistributionEntry {
  readonly accountId: number;
  readonly accountName: string;
  readonly netWorthCents: number;
  readonly absoluteCents: number;
}

@Component({
  selector: 'app-overview-net-worth-card',
  imports: [
    AppBaseCardComponent,
    AppBarChartComponent,
    TranslatePipe,
    ZardIconComponent,
    ZardLoaderComponent,
    ...ZardTooltipImports,
  ],
  templateUrl: './overview-net-worth-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class OverviewNetWorthCardComponent implements OnInit, OnDestroy, OnChanges {
  private languageChangeSubscription: Subscription | null = null;
  private accountColorHexById = new Map<number, string>();
  private netWorthResponseCache: AnalyticsNetWorthByAccountResponse | null = null;
  private readonly currentDateReference = new Date();

  readonly year = input(new Date().getFullYear());
  readonly monthIndex = input(new Date().getMonth());
  readonly isSmallScreen = input(false);

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly totalNetWorthCents = signal(0);
  protected readonly totalNetWorthPreviousMonthTotalCents = signal(0);
  protected readonly totalNetWorthPreviousMonthDeltaCents = signal(0);
  protected readonly totalReceivablesCents = signal(0);
  protected readonly totalPayablesCents = signal(0);
  protected readonly distributionBarSeries = signal<readonly AppBarChartSeries[]>([]);

  protected readonly distributionBarLabels: readonly string[] = [' '];
  protected readonly netWorthDistributionBarHeight = computed(() =>
    this.isSmallScreen() ? NET_WORTH_DISTRIBUTION_BAR_HEIGHT_MOBILE : NET_WORTH_DISTRIBUTION_BAR_HEIGHT_DESKTOP,
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
  protected readonly totalNetWorthAverageDailyMonthToDateDeltaCents = computed(() => {
    const deltaCents = this.totalNetWorthPreviousMonthDeltaCents();
    const elapsedDays = Math.max(1, this.currentDateReference.getDate());
    return deltaCents / elapsedDays;
  });

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly accountsService: AccountsService,
    private readonly localPreferencesService: LocalPreferencesService,
    private readonly translateService: TranslateService,
  ) {}

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

  protected formatCurrencyFromCents(amountCents: number): string {
    const currency = this.localPreferencesService.getCurrency().toUpperCase();
    const amount = amountCents / AMOUNT_CENTS_DIVISOR;

    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  }

  protected formatPercent(value: number): string {
    const normalizedValue = Number.isFinite(value) ? Math.abs(value) : 0;

    try {
      return `${new Intl.NumberFormat(this.resolveLocale(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(normalizedValue)}%`;
    } catch {
      return `${normalizedValue.toFixed(2)}%`;
    }
  }

  protected formatSignedCurrencyFromCents(amountCents: number): string {
    const normalizedAmountCents = Number.isFinite(Number(amountCents)) ? Number(amountCents) : 0;
    if (normalizedAmountCents === 0) {
      return this.formatCurrencyFromCents(0);
    }

    const sign = normalizedAmountCents > 0 ? '+' : '-';
    return `${sign}${this.formatCurrencyFromCents(Math.abs(normalizedAmountCents))}`;
  }

  protected netWorthAverageDailyChangeTooltipText(): string {
    const averageDailyDeltaCents = Number(this.totalNetWorthAverageDailyMonthToDateDeltaCents());
    if (!Number.isFinite(averageDailyDeltaCents)) {
      return this.translate('overview.cards.netWorth.tooltips.averageDailyChangeNeutral');
    }

    if (averageDailyDeltaCents > 0) {
      return this.translate('overview.cards.netWorth.tooltips.averageDailyChangePositive', {
        value: this.formatCurrencyFromCents(Math.abs(averageDailyDeltaCents)),
      });
    }

    if (averageDailyDeltaCents < 0) {
      return this.translate('overview.cards.netWorth.tooltips.averageDailyChangeNegative', {
        value: this.formatCurrencyFromCents(Math.abs(averageDailyDeltaCents)),
      });
    }

    return this.translate('overview.cards.netWorth.tooltips.averageDailyChangeNeutral');
  }

  private async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const { from, to } = toMonthRangeTimestamps(this.year(), this.monthIndex());
      const [netWorthResponse, receivablesPayablesResponse, accounts] = await Promise.all([
        this.analyticsService.netWorthByAccount(),
        this.analyticsService.receivablesPayables({
          filters: {
            from,
            to,
          },
        }),
        this.accountsService.listAll().catch((error) => {
          console.warn('[overview-net-worth-card] Failed to load account colors for net worth chart:', error);
          return [];
        }),
      ]);

      this.accountColorHexById = new Map(
        accounts.map((account) => [account.id, resolveVisualColorHex(account.colorKey)] as const),
      );
      this.netWorthResponseCache = netWorthResponse;

      this.applyNetWorthResponse(netWorthResponse);
      this.totalReceivablesCents.set(Number(receivablesPayablesResponse.totals?.receivables_cents ?? 0));
      this.totalPayablesCents.set(Number(receivablesPayablesResponse.totals?.payables_cents ?? 0));
    } catch (error) {
      console.error('[overview-net-worth-card] Failed to load net worth card data:', error);
      this.netWorthResponseCache = null;
      this.accountColorHexById = new Map();
      this.distributionBarSeries.set([]);
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

  private rebuildLocalizedViewModel(): void {
    if (!this.netWorthResponseCache) {
      return;
    }

    this.applyNetWorthResponse(this.netWorthResponseCache);
  }

  private applyNetWorthResponse(netWorthResponse: AnalyticsNetWorthByAccountResponse): void {
    const totalNetWorthCents = netWorthResponse.rows.reduce((total, row) => total + Number(row.net_worth_cents ?? 0), 0);
    const previousMonthDeltaCents = Number(netWorthResponse.totals?.previous_month_delta_cents ?? 0);
    const distributionEntries: NetWorthDistributionEntry[] = netWorthResponse.rows
      .map((row) => {
        const netWorthCents = Number(row.net_worth_cents ?? 0);
        const absoluteCents = Math.abs(netWorthCents);

        return {
          accountId: Number(row.account_id),
          accountName: row.account_name,
          netWorthCents,
          absoluteCents,
        };
      })
      .filter((entry) => entry.absoluteCents > 0);

    const totalAbsoluteCents = distributionEntries.reduce((total, entry) => total + entry.absoluteCents, 0);
    if (totalAbsoluteCents <= 0) {
      this.distributionBarSeries.set([]);
    } else {
      const majorEntries = distributionEntries.filter(
        (entry) => entry.absoluteCents / totalAbsoluteCents >= NET_WORTH_PIE_OTHERS_THRESHOLD,
      );
      const minorEntries = distributionEntries.filter(
        (entry) => entry.absoluteCents / totalAbsoluteCents < NET_WORTH_PIE_OTHERS_THRESHOLD,
      );

      const distributionSeries: AppBarChartSeries[] = majorEntries.map((entry) => ({
        name: entry.accountName,
        data: [toPercent(entry.absoluteCents, totalAbsoluteCents)],
        stack: 'net-worth-distribution',
        cornerRadius: 0,
        color: this.accountColorHexById.get(entry.accountId),
        tooltipValueText: this.formatCurrencyFromCents(entry.netWorthCents),
      }));

      if (minorEntries.length > 0) {
        const othersAbsoluteCents = minorEntries.reduce((total, entry) => total + entry.absoluteCents, 0);
        const tooltipDetails = minorEntries
          .slice()
          .sort((left, right) => right.absoluteCents - left.absoluteCents || left.accountName.localeCompare(right.accountName))
          .map((entry) => `• ${entry.accountName}: ${this.formatCurrencyFromCents(entry.netWorthCents)}`);

        distributionSeries.push({
          name: this.translate('overview.pie.others'),
          data: [toPercent(othersAbsoluteCents, totalAbsoluteCents)],
          stack: 'net-worth-distribution',
          cornerRadius: 0,
          color: resolveChartCssColor(`--${DEFAULT_VISUAL_COLOR_KEY}`, '#9ca3af'),
          tooltipDetails,
          tooltipHideValue: true,
        });
      }

      this.distributionBarSeries.set(distributionSeries);
    }

    this.totalNetWorthCents.set(totalNetWorthCents);
    this.totalNetWorthPreviousMonthTotalCents.set(Number(netWorthResponse.totals?.previous_month_total_cents ?? 0));
    this.totalNetWorthPreviousMonthDeltaCents.set(Number.isFinite(previousMonthDeltaCents) ? previousMonthDeltaCents : 0);
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
