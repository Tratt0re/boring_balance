import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import type { ToolbarItemNavigation } from '@/services/toolbar-context.service';
import { TransfersTableSectionComponent } from './sections/transfers-table-section/transfers-table-section.component';
import { TransactionsTableSectionComponent } from './sections/transactions-table-section/transactions-table-section.component';

type TransactionsPageView = 'common' | 'transfers';

@Component({
  selector: 'app-transaction-page',
  imports: [
    TransactionsTableSectionComponent,
    TransfersTableSectionComponent,
  ],
  templateUrl: './transaction-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionPage {
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly routeView = toSignal(
    this.activatedRoute.queryParamMap.pipe(map((params) => params.get('view'))),
    { initialValue: 'common' },
  );

  protected readonly activeView = computed<TransactionsPageView>(() =>
    this.routeView() === 'transfers' ? 'transfers' : 'common',
  );
  protected readonly toolbarItemNavigation = computed<ToolbarItemNavigation>(() => ({
    id: 'transactions-page-view',
    type: 'segmented',
    ariaLabel: 'Transaction sections',
    size: 'sm',
    defaultValue: this.activeView(),
    options: [
      { value: 'common', label: 'transactions.view.commonTransactions' },
      { value: 'transfers', label: 'transactions.view.transfers' },
    ],
    change: (value) => this.onViewChange(value),
  }));

  protected onViewChange(value: string): void {
    const nextView: TransactionsPageView = value === 'transfers' ? 'transfers' : 'common';
    if (nextView === this.activeView()) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams: { view: nextView },
      queryParamsHandling: 'merge',
    });
  }
}
