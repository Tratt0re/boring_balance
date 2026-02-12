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
        { label: 'Transactions', icon: 'credit-card', path: '/transactions' },
        { label: 'Breakdown', icon: 'circle-dollar-sign', path: '/breakdown' },
        { label: 'Compare', icon: 'activity', path: '/compare' },
      ],
    },
    {
      label: 'Settings',
      items: [
        { label: 'Budget', icon: 'dollar-sign', path: '/budget' },
        { label: 'Definitions', icon: 'settings', path: '/definitions' },
      ],
    },
  ];
}
