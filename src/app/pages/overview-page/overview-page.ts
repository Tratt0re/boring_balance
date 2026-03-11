import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import type { AnalyticsNetWorthSnapshotsDto } from '@/dtos';
import { ToolbarContextService, type ToolbarAction } from '@/services/toolbar-context.service';
import { OverviewActivityPanelComponent } from './components/overview-activity-panel/overview-activity-panel.component';
import { OverviewAllocationCardComponent } from './components/overview-allocation-card/overview-allocation-card.component';
import { OverviewCashflowCardComponent } from './components/overview-charts-card/overview-cashflow-card/overview-cashflow-card.component';
import { OverviewNetWorthCardComponent } from './components/overview-net-worth-card/overview-net-worth-card.component';

const OVERVIEW_ACTIVITY_CHANGE_RELOAD_DELAY_MS = 180;
const RECENT_ACTIVITY_DEFAULT_LIMIT = 10;
const OVERVIEW_SINGLE_COLUMN_BREAKPOINT_PX = 1024;
const EMPTY_SNAPSHOT_RECENCY: AnalyticsNetWorthSnapshotsDto = {
  hasSnapshots: false,
  latestSnapshotAtMs: null,
  daysSinceLatestSnapshot: null,
  isOutdated: false,
};

function detectOverviewSingleColumnLayoutViewport(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.innerWidth < OVERVIEW_SINGLE_COLUMN_BREAKPOINT_PX;
}

@Component({
  selector: 'app-overview-page',
  imports: [
    TranslatePipe,
    OverviewNetWorthCardComponent,
    OverviewAllocationCardComponent,
    OverviewCashflowCardComponent,
    OverviewActivityPanelComponent,
  ],
  templateUrl: './overview-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewPage implements OnInit, OnDestroy {
  @ViewChild(OverviewNetWorthCardComponent) private overviewNetWorthCardComponent?: OverviewNetWorthCardComponent;
  @ViewChild(OverviewAllocationCardComponent) private overviewAllocationCardComponent?: OverviewAllocationCardComponent;
  @ViewChild(OverviewCashflowCardComponent) private overviewCashflowCardComponent?: OverviewCashflowCardComponent;

  private releaseToolbarActions: (() => void) | null = null;
  private languageChangeSubscription: Subscription | null = null;
  private overviewActivityChangeReloadTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly currentDateReference = new Date();

  protected readonly isSingleColumnLayout = signal(false);
  protected readonly snapshotRecency = signal<AnalyticsNetWorthSnapshotsDto>(EMPTY_SNAPSHOT_RECENCY);
  protected readonly netWorthMode = signal<'valued' | 'ledger'>('ledger');
  protected readonly showSnapshotsOutdatedBanner = computed(() =>
    this.netWorthMode() === 'valued'
    && this.snapshotRecency().hasSnapshots
    && this.snapshotRecency().isOutdated
    && this.snapshotRecency().daysSinceLatestSnapshot !== null,
  );
  protected readonly currentCalendarYear = this.currentDateReference.getFullYear();
  protected readonly currentCalendarMonthIndex = this.currentDateReference.getMonth();
  protected readonly recentActivityLimit = RECENT_ACTIVITY_DEFAULT_LIMIT;

  constructor(
    private readonly toolbarContextService: ToolbarContextService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    this.updateResponsiveState();
    this.languageChangeSubscription = this.translateService.onLangChange.subscribe(() => {
      this.activateToolbarActions();
    });
    this.activateToolbarActions();
  }

  ngOnDestroy(): void {
    if (this.overviewActivityChangeReloadTimeout !== null) {
      clearTimeout(this.overviewActivityChangeReloadTimeout);
      this.overviewActivityChangeReloadTimeout = null;
    }
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
    this.languageChangeSubscription?.unsubscribe();
    this.languageChangeSubscription = null;
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.updateResponsiveState();
  }

  protected onOverviewActivityChanged(): void {
    if (this.overviewActivityChangeReloadTimeout !== null) {
      clearTimeout(this.overviewActivityChangeReloadTimeout);
    }

    this.overviewActivityChangeReloadTimeout = setTimeout(() => {
      this.overviewActivityChangeReloadTimeout = null;
      void this.overviewNetWorthCardComponent?.reload();
      void this.overviewAllocationCardComponent?.reload();
      void this.overviewCashflowCardComponent?.reload();
    }, OVERVIEW_ACTIVITY_CHANGE_RELOAD_DELAY_MS);
  }

  protected onNetWorthModeChange(netWorthMode: 'valued' | 'ledger'): void {
    this.netWorthMode.set(netWorthMode);
  }

  protected onNetWorthSnapshotsChange(snapshotRecency: AnalyticsNetWorthSnapshotsDto): void {
    this.snapshotRecency.set(snapshotRecency);
  }

  private activateToolbarActions(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.overview',
      itemActions: this.buildToolbarActions(),
    });
  }

  private buildToolbarActions(): readonly ToolbarAction[] {
    return [
      {
        id: 'overview-today-info',
        label: this.formatToolbarCurrentDateLabel(),
        icon: 'calendar',
        buttonType: 'ghost',
        buttonSize: 'sm',
        disabled: true,
        action: () => {},
      },
    ];
  }

  private formatToolbarCurrentDateLabel(): string {
    try {
      return new Intl.DateTimeFormat(this.resolveLocale(), {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(this.currentDateReference);
    } catch {
      return this.currentDateReference.toDateString();
    }
  }

  private updateResponsiveState(): void {
    this.isSingleColumnLayout.set(detectOverviewSingleColumnLayoutViewport());
  }

  private resolveLocale(): string | undefined {
    const currentLanguage = this.translateService.getCurrentLang();
    return typeof currentLanguage === 'string' && currentLanguage.trim().length > 0
      ? currentLanguage
      : undefined;
  }
}
