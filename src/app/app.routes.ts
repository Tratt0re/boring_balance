import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/overview-page/overview-page').then((module) => module.OverviewPage),
  },
  {
    path: 'transactions',
    loadComponent: () =>
      import('./pages/transaction-page/transaction-page').then((module) => module.TransactionPage),
  },
  {
    path: 'breakdown',
    loadComponent: () => import('./pages/breakdown-page/breakdown-page').then((module) => module.BreakdownPage),
  },
  {
    path: 'compare',
    loadComponent: () => import('./pages/compare-page/compare-page').then((module) => module.ComparePage),
  },
  {
    path: 'accounts',
    loadComponent: () => import('./pages/accounts-page/accounts-page').then((module) => module.AccountsPage),
  },
  {
    path: 'budget',
    loadComponent: () => import('./pages/budget-page/budget-page').then((module) => module.BudgetPage),
  },
  {
    path: 'categories',
    loadComponent: () =>
      import('./pages/categories-page/categories-page').then((module) => module.CategoriesPage),
  },
  {
    path: 'recurring-events',
    loadComponent: () =>
      import('./pages/recurring-events-page/recurring-events-page').then((module) => module.RecurringEventsPage),
  },
  { path: 'settings', pathMatch: 'full', redirectTo: 'settings/general' },
  {
    path: 'settings/:section',
    loadComponent: () => import('./pages/settings/settings.page').then((module) => module.SettingsPage),
  },
  { path: 'data-backups', pathMatch: 'full', redirectTo: 'settings/backups' },
  { path: 'about', pathMatch: 'full', redirectTo: 'settings/about' },
  {
    path: 'account-valuations/:accountId',
    loadComponent: () =>
      import('./pages/account-valuations-page/account-valuations-page').then(
        (module) => module.AccountValuationsPage,
      ),
  },
  { path: '**', redirectTo: '' },
];
