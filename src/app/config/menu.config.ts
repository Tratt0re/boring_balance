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
      label: 'nav.sections.main',
      items: [
        { label: 'nav.items.overview', icon: 'layout-dashboard', path: '/', exact: true },
        { label: 'nav.items.transactions', icon: 'badge-euro', path: '/transactions' },
      ],
    },
    {
      label: 'nav.sections.insights',
      items: [
        { label: 'nav.items.breakdown', icon: 'chart-line', path: '/breakdown' },
        { label: 'nav.items.compare', icon: 'scale', path: '/compare' },
        { label: 'nav.items.budget', icon: 'chart-pie', path: '/budget' },
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
      label: 'nav.sections.settings',
      items: [
        { label: 'nav.items.dataBackups', icon: 'hard-drive', path: '/data-n-backups' },
        { label: 'nav.items.about', icon: 'badge-info', path: '/about' },
      ],
    },
  ];
}
