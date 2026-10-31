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
  readonly placement?: 'top' | 'bottom';
}

export class MenuConfiguration {
  static readonly sections: readonly MenuSectionConfig[] = [
    {
      label: '',
      items: [
        { label: 'nav.items.overview', icon: 'layout-dashboard', path: '/', exact: true },
        { label: 'nav.items.transactions', icon: 'receipt-text', path: '/transactions' },
        { label: 'nav.items.breakdown', icon: 'chart-line', path: '/breakdown' },
        { label: 'nav.items.compare', icon: 'scale', path: '/compare' },
      ],
    },
    {
      label: 'nav.sections.plan',
      items: [
        { label: 'nav.items.budget', icon: 'chart-pie', path: '/budget' },
        { label: 'nav.items.recurringEvents', icon: 'calendar-plus', path: '/recurring-events' },
      ],
    },
    {
      label: 'nav.sections.setup',
      items: [
        { label: 'nav.items.accounts', icon: 'landmark', path: '/accounts' },
        { label: 'nav.items.categories', icon: 'tags', path: '/categories' },
      ],
    },
    {
      label: '',
      placement: 'bottom',
      items: [{ label: 'nav.items.settings', icon: 'settings', path: '/settings' }],
    },
  ];
}
