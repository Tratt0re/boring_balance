import { Component, signal } from '@angular/core';

import { ZardIconComponent, type ZardIcon } from '@/shared/components/icon';
import { LayoutImports } from '@/shared/components/layout/layout.imports';

interface HomeNavItem {
  readonly label: string;
  readonly icon: ZardIcon;
  readonly active?: boolean;
  readonly badge?: string;
}

interface SummaryCard {
  readonly label: string;
  readonly amount: string;
  readonly hint: string;
  readonly icon: ZardIcon;
}

interface ActivityItem {
  readonly title: string;
  readonly category: string;
  readonly amount: string;
}

interface BillItem {
  readonly name: string;
  readonly dueDate: string;
  readonly amount: string;
  readonly icon: ZardIcon;
}

@Component({
  selector: 'app-root',
  imports: [...LayoutImports, ZardIconComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly sidebarCollapsed = signal(false);

  protected readonly navItems: readonly HomeNavItem[] = [
    { label: 'Dashboard', icon: 'layout-dashboard', active: true },
    { label: 'Transactions', icon: 'credit-card' },
    { label: 'Budgets', icon: 'circle-dollar-sign' },
    { label: 'Calendar', icon: 'calendar' },
    { label: 'Alerts', icon: 'bell', badge: '3' },
  ];

  protected readonly summaryCards: readonly SummaryCard[] = [
    { label: 'Monthly Spend', amount: '$1,284.90', hint: '8% below last month', icon: 'dollar-sign' },
    { label: 'Income', amount: '$4,200.00', hint: 'Salary posted on Feb 1', icon: 'arrow-up' },
    { label: 'Remaining Budget', amount: '$2,315.10', hint: '55% of budget left', icon: 'circle-dollar-sign' },
  ];

  protected readonly recentActivity: readonly ActivityItem[] = [
    { title: 'Whole Foods', category: 'Groceries', amount: '-$84.26' },
    { title: 'Spotify', category: 'Subscriptions', amount: '-$10.99' },
    { title: 'Paycheck Deposit', category: 'Income', amount: '+$2,100.00' },
    { title: 'City Transit', category: 'Transport', amount: '-$32.00' },
  ];

  protected readonly upcomingBills: readonly BillItem[] = [
    { name: 'Rent', dueDate: 'Due Feb 15', amount: '$1,450.00', icon: 'house' },
    { name: 'Electricity', dueDate: 'Due Feb 18', amount: '$92.40', icon: 'zap' },
    { name: 'Internet', dueDate: 'Due Feb 20', amount: '$59.99', icon: 'monitor' },
  ];

  protected setSidebarCollapsed(isCollapsed: boolean): void {
    this.sidebarCollapsed.set(isCollapsed);
  }
}
