import { Component, HostListener, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AnalyticsService } from '@/services/analytics.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ZardSwitchComponent } from '@/shared/components/switch';
import { detectSmallScreenViewport } from '@/shared/utils';

import { CategoryBreakdownSectionComponent } from './sections/category-breakdown-section/category-breakdown-section.component';
import { MoneyFlowBreakdownSectionComponent } from './sections/money-flow-breakdown-section/money-flow-breakdown-section.component';

type BreakdownSectionView = 'money-flow' | 'expense' | 'income';
const BREAKDOWN_YEAR_SELECTOR_MIN_YEAR = 2000;

@Component({
  selector: 'app-breakdown-page',
  imports: [
    CategoryBreakdownSectionComponent,
    MoneyFlowBreakdownSectionComponent,
    TranslatePipe,
    ZardSwitchComponent,
  ],
  templateUrl: './breakdown-page.html',
})
export class BreakdownPage implements OnInit, OnDestroy {
  private releaseToolbarActions: (() => void) | null = null;
  private readonly currentYearReference = new Date().getFullYear();
  protected readonly isSmallScreen = signal(false);
  protected readonly currentCalendarYear = signal(this.currentYearReference);
  protected readonly activeSectionView = signal<BreakdownSectionView>('expense');
  protected readonly useElapsedMonthsAverage = signal(false);
  protected readonly showMoneyFlowAllocationTargets = signal(true);
  protected readonly canUseElapsedMonthsAverage = computed(
    () => this.currentCalendarYear() === this.currentYearReference,
  );
  protected readonly effectiveUseElapsedMonthsAverage = computed(
    () => this.canUseElapsedMonthsAverage() && this.useElapsedMonthsAverage(),
  );
  protected readonly showOptionsCard = computed(
    () => this.activeSectionView() === 'money-flow' || this.canUseElapsedMonthsAverage(),
  );
  private toolbarYearOptions: ReadonlyArray<{ value: string; label: string }> = [
    {
      value: String(this.currentYearReference),
      label: String(this.currentYearReference),
    },
  ];

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly toolbarContextService: ToolbarContextService,
  ) {}

  ngOnInit(): void {
    this.updateResponsiveState();
    void this.initializeToolbar();
  }

  ngOnDestroy(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.updateResponsiveState();
  }

  protected onSectionViewChange(value: string): void {
    const nextView: BreakdownSectionView =
      value === 'expense' || value === 'income' || value === 'money-flow' ? value : 'money-flow';
    if (nextView === this.activeSectionView()) {
      return;
    }

    this.activeSectionView.set(nextView);
  }

  protected onYearChange(value: string): void {
    const nextYear = Number.parseInt(value, 10);
    if (!Number.isInteger(nextYear) || nextYear < BREAKDOWN_YEAR_SELECTOR_MIN_YEAR || nextYear > this.currentYearReference) {
      return;
    }

    if (nextYear === this.currentCalendarYear()) {
      return;
    }

    this.setCurrentCalendarYear(nextYear);
  }

  private activateToolbarItems(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.breakdown',
      items: [
        {
          id: 'breakdown-year',
          type: 'select',
          label: 'breakdown.toolbar.selectYear',
          ariaLabel: 'Breakdown year',
          size: 'sm',
          class: 'w-28 shrink-0',
          value: () => String(this.currentCalendarYear()),
          options: this.toolbarYearOptions,
          change: (value) => this.onYearChange(value),
        },
        {
          id: 'breakdown-section-view',
          type: 'segmented',
          ariaLabel: 'Breakdown sections',
          size: 'sm',
          defaultValue: this.activeSectionView(),
          options: [
            { value: 'expense', label: 'overview.cards.monthlyTotals.series.expenses' },
            { value: 'income', label: 'overview.cards.monthlyTotals.series.incomes' },
            { value: 'money-flow', label: 'overview.cards.moneyFlowSankey.title' },
          ],
          change: (value) => this.onSectionViewChange(value),
        },
      ],
      actions: [],
    });
  }

  private async initializeToolbar(): Promise<void> {
    await this.loadAvailableYears();
    this.activateToolbarItems();
  }

  private async loadAvailableYears(): Promise<void> {
    try {
      const availableYears = await this.analyticsService.availableYears();
      const normalizedYears = availableYears
        .filter((year) => Number.isInteger(year))
        .filter((year) => year >= BREAKDOWN_YEAR_SELECTOR_MIN_YEAR && year <= this.currentYearReference);

      if (normalizedYears.length === 0) {
        return;
      }

      this.toolbarYearOptions = normalizedYears.map((year) => ({
        value: String(year),
        label: String(year),
      }));

      if (!normalizedYears.includes(this.currentCalendarYear())) {
        this.setCurrentCalendarYear(normalizedYears[0]!);
      }
    } catch (error) {
      console.warn('[breakdown-page] Failed to load available years for toolbar selector:', error);
    }
  }

  private setCurrentCalendarYear(year: number): void {
    if (year !== this.currentYearReference && this.useElapsedMonthsAverage()) {
      this.useElapsedMonthsAverage.set(false);
    }

    this.currentCalendarYear.set(year);
  }

  private updateResponsiveState(): void {
    this.isSmallScreen.set(detectSmallScreenViewport());
  }
}
