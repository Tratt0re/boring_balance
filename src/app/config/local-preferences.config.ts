export enum LocalPreferenceKey {
  THEME = 'theme',
  THEME_COLOR = 'theme_color',
  LANGUAGE = 'language',
  CURRENCY = 'currency',
  CURRENCY_FORMAT_STYLE = 'currency_format_style',
  DASHBOARD_USE_VALUATION = 'dashboard_use_valuation',
  ONBOARDING_COMPLETED = 'onboarding_completed',
  TRANSACTIONS_TABLE_STATE = 'transactions_table_state',
  TRANSFERS_TABLE_STATE = 'transfers_table_state',
  SYNC_STATE = 'sync_state',
}

export type ThemePreference = 'light' | 'dark' | 'system';
export type CurrencySymbol = string;
export type CurrencyFormatStyle = 'US' | 'EU_DOT' | 'EU_SPACE';

export interface LocalPreferences {
  readonly theme: ThemePreference;
  readonly themeColor: string;
  readonly language: string;
  readonly currency: CurrencySymbol;
  readonly currencyFormatStyle: CurrencyFormatStyle;
  readonly dashboardUseValuation: boolean;
  readonly onboardingCompleted: boolean;
}

export const LOCAL_PREFERENCE_DEFAULTS: Readonly<LocalPreferences> = Object.freeze({
  theme: 'system',
  themeColor: 'default',
  language: 'en',
  currency: '€',
  currencyFormatStyle: 'EU_DOT',
  dashboardUseValuation: true,
  onboardingCompleted: false,
});
