export const SETTINGS_SECTION_KEYS = ['general', 'backups', 'sync', 'export', 'data', 'about'] as const;

export type SettingsSectionKey = typeof SETTINGS_SECTION_KEYS[number];

export interface SettingsNavItem {
  readonly key: SettingsSectionKey;
  readonly label: string;
  readonly description: string;
}

export const DEFAULT_SETTINGS_SECTION: SettingsSectionKey = 'general';

export const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  {
    key: 'general',
    label: 'settings.sections.general.title',
    description: 'settings.sections.general.description',
  },
  {
    key: 'backups',
    label: 'dataBackups.sections.backups.title',
    description: 'dataBackups.backups.destination.description',
  },
  {
    key: 'sync',
    label: 'dataBackups.sections.sync.title',
    description: 'dataBackups.sync.overview.description',
  },
  {
    key: 'export',
    label: 'dataBackups.sections.exportImport.title',
    description: 'dataBackups.exportImport.overview.description',
  },
  {
    key: 'data',
    label: 'settings.sections.data.title',
    description: 'settings.sections.data.description',
  },
  {
    key: 'about',
    label: 'settings.sections.about.title',
    description: 'settings.sections.about.description',
  },
] as const;

export function isSettingsSectionKey(value: string | null | undefined): value is SettingsSectionKey {
  return typeof value === 'string' && SETTINGS_SECTION_KEYS.includes(value as SettingsSectionKey);
}
