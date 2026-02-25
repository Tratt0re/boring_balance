import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { ToolbarContextService, type ToolbarAction } from '@/services/toolbar-context.service';
import { OverviewMoneyFlowSankeyCardComponent } from './components/overview-money-flow-sankey-card/overview-money-flow-sankey-card.component';
import { OverviewMonthlyTotalsCardComponent } from './components/overview-monthly-totals-card/overview-monthly-totals-card.component';
import { OverviewNetWorthCardComponent } from './components/overview-net-worth-card/overview-net-worth-card.component';
import { OverviewRecentTransactionsCardComponent } from './components/overview-recent-transactions-card/overview-recent-transactions-card.component';

const RECENT_TRANSACTION_STATE_CHANGE_RELOAD_DELAY_MS = 180;
const RECENT_TRANSACTIONS_DEFAULT_LIMIT = 5;
const OVERVIEW_SINGLE_COLUMN_BREAKPOINT_PX = 1024;

function detectOverviewSingleColumnLayoutViewport(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.innerWidth < OVERVIEW_SINGLE_COLUMN_BREAKPOINT_PX;
}

@Component({
  selector: 'app-overview-page',
  imports: [
    OverviewNetWorthCardComponent,
    OverviewMonthlyTotalsCardComponent,
    OverviewRecentTransactionsCardComponent,
    OverviewMoneyFlowSankeyCardComponent,
  ],
  templateUrl: './overview-page.html',
})
export class OverviewPage implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild(OverviewNetWorthCardComponent) private overviewNetWorthCardComponent?: OverviewNetWorthCardComponent;
  @ViewChild('moneyFlowSankeyCard', { read: ElementRef }) private moneyFlowSankeyCardElement?: ElementRef<HTMLElement>;

  private releaseToolbarActions: (() => void) | null = null;
  private languageChangeSubscription: Subscription | null = null;
  private moneyFlowSankeyCardResizeObserver: ResizeObserver | null = null;
  private recentTransactionStateChangeReloadTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly currentDateReference = new Date();
  private readonly measuredMoneyFlowSankeyCardHeight = signal<string | null>(null);

  protected readonly isSingleColumnLayout = signal(false);
  protected readonly currentCalendarYear = this.currentDateReference.getFullYear();
  protected readonly currentCalendarMonthIndex = this.currentDateReference.getMonth();
  protected readonly recentTransactionsLimit = RECENT_TRANSACTIONS_DEFAULT_LIMIT;
  protected readonly lastTransactionsCardHeight = computed(() =>
    this.isSingleColumnLayout() ? null : this.measuredMoneyFlowSankeyCardHeight(),
  );

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

  ngAfterViewInit(): void {
    this.observeMoneyFlowSankeyCardHeight();
  }

  ngOnDestroy(): void {
    if (this.recentTransactionStateChangeReloadTimeout !== null) {
      clearTimeout(this.recentTransactionStateChangeReloadTimeout);
      this.recentTransactionStateChangeReloadTimeout = null;
    }
    this.moneyFlowSankeyCardResizeObserver?.disconnect();
    this.moneyFlowSankeyCardResizeObserver = null;
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
    this.languageChangeSubscription?.unsubscribe();
    this.languageChangeSubscription = null;
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.updateResponsiveState();
  }

  protected onRecentTransactionStateChanged(): void {
    if (this.recentTransactionStateChangeReloadTimeout !== null) {
      clearTimeout(this.recentTransactionStateChangeReloadTimeout);
    }

    this.recentTransactionStateChangeReloadTimeout = setTimeout(() => {
      this.recentTransactionStateChangeReloadTimeout = null;
      void this.overviewNetWorthCardComponent?.reload();
    }, RECENT_TRANSACTION_STATE_CHANGE_RELOAD_DELAY_MS);
  }

  private observeMoneyFlowSankeyCardHeight(): void {
    const element = this.moneyFlowSankeyCardElement?.nativeElement;
    if (!element) {
      return;
    }

    this.updateMeasuredMoneyFlowSankeyCardHeight(element);

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    this.moneyFlowSankeyCardResizeObserver?.disconnect();
    this.moneyFlowSankeyCardResizeObserver = new ResizeObserver(() => {
      this.updateMeasuredMoneyFlowSankeyCardHeight(element);
    });
    this.moneyFlowSankeyCardResizeObserver.observe(element);
  }

  private updateMeasuredMoneyFlowSankeyCardHeight(element: HTMLElement): void {
    const nextHeight = element.getBoundingClientRect().height;
    this.measuredMoneyFlowSankeyCardHeight.set(nextHeight > 0 ? `${nextHeight.toFixed(2)}px` : null);
  }

  private activateToolbarActions(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.overview',
      actions: this.buildToolbarActions(),
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
