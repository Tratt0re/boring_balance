import { Routes } from '@angular/router';

import { AccountsPage } from '@/pages/accounts-page/accounts-page';
import { BreakdownPage } from '@/pages/breakdown-page/breakdown-page';
import { ComparePage } from '@/pages/compare-page/compare-page';
import { CategoriesPage } from '@/pages/categories-page/categories-page';
import { BudgetPage } from '@/pages/budget-page/budget-page';
import { OverviewPage } from '@/pages/overview-page/overview-page';
import { RecurringEventsPage } from '@/pages/recurring-events-page/recurring-events-page';
import { SettingsPage } from '@/pages/settings/settings.page';
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
  { path: 'settings', pathMatch: 'full', redirectTo: 'settings/general' },
  { path: 'settings/:section', component: SettingsPage },
  { path: 'data-backups', pathMatch: 'full', redirectTo: 'settings/backups' },
  { path: 'about', pathMatch: 'full', redirectTo: 'settings/about' },
  { path: '**', redirectTo: '' },
];
