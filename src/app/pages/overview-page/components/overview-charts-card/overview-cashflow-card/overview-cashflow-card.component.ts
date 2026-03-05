import { ChangeDetectionStrategy, Component, TemplateRef, ViewChild, input, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AppBaseCardComponent } from '@/components/base-card';
import {
  ZardSegmentedComponent,
  ZardSegmentedItemComponent,
} from '@/shared/components/segmented';
import { OverviewMoneyFlowSankeyCardComponent } from '../overview-money-flow-sankey-card/overview-money-flow-sankey-card.component';
import { OverviewMonthlyTotalsCardComponent } from '../overview-monthly-totals-card/overview-monthly-totals-card.component';

type OverviewCashflowView = 'incomeExpenses' | 'moneyFlow';

const DEFAULT_VIEW: OverviewCashflowView = 'incomeExpenses';

@Component({
  selector: 'app-overview-cashflow-card',
  imports: [
    AppBaseCardComponent,
    TranslatePipe,
    ZardSegmentedComponent,
    ZardSegmentedItemComponent,
    OverviewMonthlyTotalsCardComponent,
    OverviewMoneyFlowSankeyCardComponent,
  ],
  templateUrl: './overview-cashflow-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full min-h-0',
  },
})
export class OverviewCashflowCardComponent {
  @ViewChild(OverviewMonthlyTotalsCardComponent)
  private overviewMonthlyTotalsCardComponent?: OverviewMonthlyTotalsCardComponent;
  @ViewChild(OverviewMoneyFlowSankeyCardComponent)
  private overviewMoneyFlowSankeyCardComponent?: OverviewMoneyFlowSankeyCardComponent;
  protected readonly cardSegmentedTitle = viewChild.required<TemplateRef<void>>('cardSegmentedTitleTpl');

  readonly year = input(new Date().getFullYear());
  readonly monthIndex = input(new Date().getMonth());
  readonly isSmallScreen = input(false);

  protected readonly activeView = signal<OverviewCashflowView>(DEFAULT_VIEW);

  async reload(): Promise<void> {
    await Promise.all([
      this.overviewMonthlyTotalsCardComponent?.reload(),
      this.overviewMoneyFlowSankeyCardComponent?.reload(),
    ]);
  }

  protected onViewChange(value: string): void {
    this.activeView.set(value === 'moneyFlow' ? 'moneyFlow' : 'incomeExpenses');
  }
}
