export enum LocalPreferenceKey {
  THEME = 'theme',
  THEME_COLOR = 'theme_color',
  LANGUAGE = 'language',
  CURRENCY = 'currency',
  ONBOARDING_COMPLETED = 'onboarding_completed',
  TRANSACTIONS_TABLE_STATE = 'transactions_table_state',
}

export type ThemePreference = 'light' | 'dark' | 'system';

export interface LocalPreferences {
  readonly theme: ThemePreference;
  readonly themeColor: string;
  readonly language: string;
  readonly currency: string;
  readonly onboardingCompleted: boolean;
}

export const LOCAL_PREFERENCE_DEFAULTS: Readonly<LocalPreferences> = Object.freeze({
  theme: 'system',
  themeColor: 'default',
  language: 'en',
  currency: 'EUR',
  onboardingCompleted: false,
});
