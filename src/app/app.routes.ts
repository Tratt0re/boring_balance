import { Routes } from '@angular/router';

import { AccountsPage } from '@/pages/accounts-page/accounts-page';
import { BreakdownPage } from '@/pages/breakdown-page/breakdown-page';
import { ComparePage } from '@/pages/compare-page/compare-page';
import { CategoriesPage } from '@/pages/categories-page/categories-page';
import { BudgetPage } from '@/pages/budget-page/budget-page';
import { OverviewPage } from '@/pages/overview-page/overview-page';
import { RecurringEventsPage } from '@/pages/recurring-events-page/recurring-events-page';
import { TransactionPage } from '@/pages/transaction-page/transaction-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: OverviewPage },
  { path: 'transactions', component: TransactionPage },
  { path: 'breakdown', component: BreakdownPage },
  { path: 'compare', component: ComparePage },
  { path: 'accounts', component: AccountsPage },
  { path: 'budget', component: BudgetPage },
  { path: 'categories', component: CategoriesPage },
  { path: 'recurring-events', component: RecurringEventsPage },
  { path: '**', redirectTo: '' },
];
