import { Routes } from '@angular/router';

import { BreakdownPage } from '@/pages/breakdown-page/breakdown-page';
import { ComparePage } from '@/pages/compare-page/compare-page';
import { DefinitionsPage } from '@/pages/settings/definitions-page/definitions-page';
import { BudgetPage } from '@/pages/settings/budget-page/budget-page';
import { OverviewPage } from '@/pages/overview-page/overview-page';
import { TransactionPage } from '@/pages/transaction-page/transaction-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: OverviewPage },
  { path: 'transactions', component: TransactionPage },
  { path: 'breakdown', component: BreakdownPage },
  { path: 'compare', component: ComparePage },
  { path: 'budget', component: BudgetPage },
  { path: 'definitions', component: DefinitionsPage },
  { path: '**', redirectTo: '' },
];
