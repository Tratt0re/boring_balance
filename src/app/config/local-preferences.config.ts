export enum LocalPreferenceKey {
  THEME = 'theme',
  THEME_COLOR = 'theme_color',
  LANGUAGE = 'language',
  CURRENCY = 'currency',
  ONBOARDING_COMPLETED = 'onboarding_completed',
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
