import type { ZardIcon } from '@/shared/components/icon';

export interface MenuItemConfig {
  readonly label: string;
  readonly icon: ZardIcon;
  readonly path: string;
  readonly exact?: boolean;
}

export interface MenuSectionConfig {
  readonly label: string;
  readonly items: readonly MenuItemConfig[];
}

export class MenuConfiguration {
  static readonly sections: readonly MenuSectionConfig[] = [
    {
      label: 'Main',
      items: [
        { label: 'Overview', icon: 'layout-dashboard', path: '/', exact: true },
        { label: 'Transactions', icon: 'badge-euro', path: '/transactions' },
      ],
    },
    {
      label: 'Insights',
      items: [
        { label: 'Breakdown', icon: 'chart-line', path: '/breakdown' },
        { label: 'Compare', icon: 'scale', path: '/compare' },
        { label: 'Budget', icon: 'chart-pie', path: '/budget' },
      ],
    },
    {
      label: 'Setup',
      items: [
        { label: 'Accounts', icon: 'landmark', path: '/accounts' },
        { label: 'Categories', icon: 'tags', path: '/categories' },
      ],
    },
    {
      label: 'Settings',
      items: [
        { label: 'General', icon: 'settings', path: '/general' },
        { label: 'Data & Backups', icon: 'hard-drive', path: '/data-n-backups' },
        { label: 'About', icon: 'badge-info', path: '/about' }
      ],
    },
  ];

}
