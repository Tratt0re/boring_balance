import { Component, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ZardSegmentedComponent, ZardSegmentedItemComponent } from '@/shared/components/segmented';
import { TransfersTableSectionComponent } from './sections/transfers-table-section/transfers-table-section.component';
import { TransactionsTableSectionComponent } from './sections/transactions-table-section/transactions-table-section.component';

type TransactionsPageView = 'common' | 'transfers';

@Component({
  selector: 'app-transaction-page',
  imports: [
    TranslatePipe,
    ZardSegmentedComponent,
    ZardSegmentedItemComponent,
    TransactionsTableSectionComponent,
    TransfersTableSectionComponent,
  ],
  templateUrl: './transaction-page.html',
})
export class TransactionPage {
  protected readonly activeView = signal<TransactionsPageView>('common');

  protected onViewChange(value: string): void {
    const nextView: TransactionsPageView = value === 'transfers' ? 'transfers' : 'common';
    if (nextView === this.activeView()) {
      return;
    }

    this.activeView.set(nextView);
  }
}
