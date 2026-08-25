import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { centsToAmount, type PlanItemModel, toBooleanFlag } from '@/models';
import { TransactionsTableSectionComponent } from '@/pages/transaction-page/sections/transactions-table-section/transactions-table-section.component';
import { TransfersTableSectionComponent } from '@/pages/transaction-page/sections/transfers-table-section/transfers-table-section.component';
import { AccountsService } from '@/services/accounts.service';
import { CategoriesService } from '@/services/categories.service';
import { NumberFormatService } from '@/services/number-format.service';
import { PlanItemsService } from '@/services/plan-items.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import { translateMaybe } from '@/shared/utils';

@Component({
  selector: 'app-recurring-event-items-page',
  imports: [
    DatePipe,
    TranslatePipe,
    TransactionsTableSectionComponent,
    TransfersTableSectionComponent,
    ZardSkeletonComponent,
  ],
  templateUrl: './recurring-event-items-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringEventItemsPage implements OnInit, OnDestroy {
  protected readonly planItem = signal<PlanItemModel | null>(null);
  protected readonly primaryAccountName = signal<string | null>(null);
  protected readonly secondaryAccountName = signal<string | null>(null);
  protected readonly categoryName = signal<string | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly templateAmount = computed(() =>
    centsToAmount(this.planItem()?.templateJson.amount_cents ?? 0),
  );
  protected readonly templateSettled = computed(() => {
    const settled = this.planItem()?.templateJson.settled;
    return settled === undefined ? false : toBooleanFlag(settled);
  });

  private releaseToolbarActions: (() => void) | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly planItemsService: PlanItemsService,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    protected readonly numberFormatService: NumberFormatService,
    private readonly toolbarContextService: ToolbarContextService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'recurringEventItems.page.title',
      titleMode: 'breadcrumb',
      titleBreadcrumbs: [
        { label: 'nav.items.recurringEvents', path: '/recurring-events' },
        { label: 'recurringEventItems.page.title' },
      ],
    });

    const paramId = this.route.snapshot.paramMap.get('planItemId');
    const parsedId = paramId ? Number.parseInt(paramId, 10) : NaN;
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      this.isLoading.set(false);
      this.loadError.set(this.translateService.instant('recurringEventItems.errors.invalidId'));
      return;
    }

    void this.loadPageData(parsedId);
  }

  ngOnDestroy(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
  }

  private async loadPageData(planItemId: number): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const planItem = await this.planItemsService.get({ id: planItemId });
      if (!planItem) {
        throw new Error(this.translateService.instant('recurringEventItems.errors.notFound'));
      }

      if (planItem.type === 'transaction' && 'account_id' in planItem.templateJson) {
        const [account, category] = await Promise.all([
          this.accountsService.get({ id: planItem.templateJson.account_id }),
          this.categoriesService.get({ id: planItem.templateJson.category_id }),
        ]);
        this.primaryAccountName.set(account?.name ?? `${planItem.templateJson.account_id}`);
        this.categoryName.set(
          category
            ? translateMaybe(this.translateService, category.name)
            : `${planItem.templateJson.category_id}`,
        );
      } else if ('from_account_id' in planItem.templateJson) {
        const [fromAccount, toAccount] = await Promise.all([
          this.accountsService.get({ id: planItem.templateJson.from_account_id }),
          this.accountsService.get({ id: planItem.templateJson.to_account_id }),
        ]);
        this.primaryAccountName.set(fromAccount?.name ?? `${planItem.templateJson.from_account_id}`);
        this.secondaryAccountName.set(toAccount?.name ?? `${planItem.templateJson.to_account_id}`);
      }

      this.planItem.set(planItem);
    } catch (error) {
      this.planItem.set(null);
      this.primaryAccountName.set(null);
      this.secondaryAccountName.set(null);
      this.categoryName.set(null);
      this.loadError.set(
        error instanceof Error
          ? error.message
          : this.translateService.instant('recurringEventItems.errors.loadUnexpected'),
      );
      console.error('[recurring-event-items-page] Failed to load page data:', error);
    } finally {
      this.isLoading.set(false);
    }
  }
}
