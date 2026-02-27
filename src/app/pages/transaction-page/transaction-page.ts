import { Component, computed, signal } from '@angular/core';

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
})
export class TransactionPage {
  protected readonly activeView = signal<TransactionsPageView>('common');
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

    this.activeView.set(nextView);
  }
}
