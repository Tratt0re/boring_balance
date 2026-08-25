import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs';

import { DEFAULT_VISUAL_COLOR_KEY, DEFAULT_VISUAL_ICON_KEY } from '@/config/visual-options.config';
import { centsToAmount, type AccountModel } from '@/models';
import { TransactionsTableSectionComponent } from '@/pages/transaction-page/sections/transactions-table-section/transactions-table-section.component';
import { TransfersTableSectionComponent } from '@/pages/transaction-page/sections/transfers-table-section/transfers-table-section.component';
import { AccountsService } from '@/services/accounts.service';
import { AnalyticsService } from '@/services/analytics.service';
import { NumberFormatService } from '@/services/number-format.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ZardIconComponent, type ZardIcon } from '@/shared/components/icon';
import { ZardSegmentedComponent, ZardSegmentedItemComponent } from '@/shared/components/segmented';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';

type AccountDetailView = 'transactions' | 'transfers';

@Component({
  selector: 'app-account-detail-page',
  imports: [
    TranslatePipe,
    TransactionsTableSectionComponent,
    TransfersTableSectionComponent,
    ZardIconComponent,
    ZardSegmentedComponent,
    ZardSegmentedItemComponent,
    ZardSkeletonComponent,
  ],
  templateUrl: './account-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountDetailPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly routeView = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('view'))),
    { initialValue: 'transactions' },
  );

  protected readonly account = signal<AccountModel | null>(null);
  protected readonly accountValueCents = signal(0);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly activeView = computed<AccountDetailView>(() =>
    this.routeView() === 'transfers' ? 'transfers' : 'transactions',
  );
  protected readonly accountIcon = computed(
    () => (this.account()?.icon ?? DEFAULT_VISUAL_ICON_KEY) as ZardIcon,
  );
  protected readonly accountIconColorHex = computed(
    () => `var(--${this.account()?.colorKey ?? DEFAULT_VISUAL_COLOR_KEY})`,
  );

  private accountId: number | null = null;
  private releaseToolbarActions: (() => void) | null = null;

  constructor(
    private readonly accountsService: AccountsService,
    private readonly analyticsService: AnalyticsService,
    private readonly numberFormatService: NumberFormatService,
    private readonly toolbarContextService: ToolbarContextService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'accountDetails.page.title',
      titleMode: 'breadcrumb',
      titleBreadcrumbs: [
        { label: 'nav.items.accounts', path: '/accounts' },
        { label: 'accountDetails.page.title' },
      ],
    });

    const paramId = this.route.snapshot.paramMap.get('accountId');
    const parsedId = paramId ? Number.parseInt(paramId, 10) : NaN;
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      this.isLoading.set(false);
      this.loadError.set(this.translateService.instant('accountDetails.errors.invalidId'));
      return;
    }

    this.accountId = parsedId;
    void this.loadPageData(parsedId);
  }

  ngOnDestroy(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
  }

  protected onViewChange(value: string): void {
    const nextView: AccountDetailView = value === 'transfers' ? 'transfers' : 'transactions';
    if (nextView === this.activeView()) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: nextView },
      queryParamsHandling: 'merge',
    });
  }

  protected formatAccountValue(): string {
    return this.numberFormatService.formatCurrency(centsToAmount(this.accountValueCents()));
  }

  protected onActivityChanged(): void {
    void this.reloadAccountValue();
  }

  private async loadPageData(accountId: number): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const [account, netWorthResponse] = await Promise.all([
        this.accountsService.get({ id: accountId }),
        this.analyticsService.netWorthByAccount({
          account_ids: [accountId],
          useValuation: false,
        }),
      ]);

      if (!account) {
        throw new Error(this.translateService.instant('accountDetails.errors.notFound'));
      }

      const accountNetWorthRow = netWorthResponse.rows.find((row) => row.account_id === accountId);
      this.account.set(account);
      this.accountValueCents.set(accountNetWorthRow?.net_worth_cents ?? 0);
    } catch (error) {
      this.account.set(null);
      this.accountValueCents.set(0);
      this.loadError.set(
        error instanceof Error
          ? error.message
          : this.translateService.instant('accountDetails.errors.loadUnexpected'),
      );
      console.error('[account-detail-page] Failed to load page data:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async reloadAccountValue(): Promise<void> {
    if (!this.accountId) {
      return;
    }

    try {
      const netWorthResponse = await this.analyticsService.netWorthByAccount({
        account_ids: [this.accountId],
        useValuation: false,
      });
      const accountNetWorthRow = netWorthResponse.rows.find(
        (row) => row.account_id === this.accountId,
      );
      this.accountValueCents.set(accountNetWorthRow?.net_worth_cents ?? 0);
    } catch (error) {
      console.error('[account-detail-page] Failed to reload account value:', error);
    }
  }
}
