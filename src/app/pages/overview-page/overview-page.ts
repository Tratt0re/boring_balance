import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom, Subscription } from 'rxjs';

import type { AnalyticsNetWorthSnapshotsDto } from '@/dtos';
import { SyncService } from '@/pages/data-backups-page/services/sync.service';
import { ToolbarContextService, type ToolbarAction } from '@/services/toolbar-context.service';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardTooltipImports } from '@/shared/components/tooltip';
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
    ZardButtonComponent,
    ...ZardTooltipImports,
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
  private readonly syncService = inject(SyncService);
  private languageChangeSubscription: Subscription | null = null;
  private overviewActivityChangeReloadTimeout: ReturnType<typeof setTimeout> | null = null;
  private syncEnabled = false;
  private syncAvailabilityCheckRunning = false;
  private readonly currentDateReference = new Date();

  protected readonly isSingleColumnLayout = signal(false);
  protected readonly snapshotRecency = signal<AnalyticsNetWorthSnapshotsDto>(EMPTY_SNAPSHOT_RECENCY);
  protected readonly netWorthMode = signal<'valued' | 'ledger'>('ledger');
  protected readonly hasNewerSyncVersion = signal(false);
  protected readonly syncNowLoading = toSignal(this.syncService.syncNowLoading$, { initialValue: false });
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
    void this.initializeSyncBanner();
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

  @HostListener('window:focus')
  protected onWindowFocus(): void {
    void this.refreshSyncAvailability();
  }

  protected onSyncNow(): void {
    if (!this.hasNewerSyncVersion() || this.syncNowLoading()) {
      return;
    }

    void firstValueFrom(this.syncService.syncNow())
      .then(() => this.refreshSyncAvailability())
      .catch(() => undefined);
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

  private async initializeSyncBanner(): Promise<void> {
    const settings = await firstValueFrom(this.syncService.getSettings());
    this.syncEnabled = settings.enabled && Boolean(settings.folderPath);

    if (!this.syncEnabled) {
      this.hasNewerSyncVersion.set(false);
      return;
    }

    await this.refreshSyncAvailability();
  }

  private async refreshSyncAvailability(): Promise<void> {
    if (!this.syncEnabled || this.syncAvailabilityCheckRunning || this.syncNowLoading()) {
      return;
    }

    this.syncAvailabilityCheckRunning = true;

    try {
      const availability = await firstValueFrom(this.syncService.checkAvailability());
      this.hasNewerSyncVersion.set(availability.hasNewerRemoteSnapshot);
    } finally {
      this.syncAvailabilityCheckRunning = false;
    }
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
