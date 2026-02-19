import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

import {
  LOCAL_PREFERENCE_DEFAULTS,
  LocalPreferenceKey,
  type ThemePreference,
} from '@/config/local-preferences.config';

@Injectable({
  providedIn: 'root',
})
export class LocalPreferencesService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  init(): void {
    if (!this.isBrowser) {
      return;
    }

    this.setTheme(this.getTheme());
    this.setThemeColor(this.getThemeColor());
    this.setLanguage(this.getLanguage());
    this.setCurrency(this.getCurrency());
    this.setOnboardingCompleted(this.getOnboardingCompleted());
  }

  getTheme(): ThemePreference {
    const value = this.getText(LocalPreferenceKey.THEME);
    if (value === 'light' || value === 'dark' || value === 'system') {
      return value;
    }

    return LOCAL_PREFERENCE_DEFAULTS.theme;
  }

  setTheme(theme: ThemePreference): void {
    this.setText(LocalPreferenceKey.THEME, theme);
  }

  getThemeColor(): string {
    return this.getText(LocalPreferenceKey.THEME_COLOR) ?? LOCAL_PREFERENCE_DEFAULTS.themeColor;
  }

  setThemeColor(themeColor: string): void {
    this.setText(LocalPreferenceKey.THEME_COLOR, themeColor.trim() || LOCAL_PREFERENCE_DEFAULTS.themeColor);
  }

  getLanguage(): string {
    return this.getText(LocalPreferenceKey.LANGUAGE) ?? LOCAL_PREFERENCE_DEFAULTS.language;
  }

  hasLanguagePreference(): boolean {
    return this.getText(LocalPreferenceKey.LANGUAGE) !== undefined;
  }

  setLanguage(language: string): void {
    this.setText(LocalPreferenceKey.LANGUAGE, language.trim() || LOCAL_PREFERENCE_DEFAULTS.language);
  }

  getCurrency(): string {
    return this.getText(LocalPreferenceKey.CURRENCY) ?? LOCAL_PREFERENCE_DEFAULTS.currency;
  }

  setCurrency(currency: string): void {
    this.setText(LocalPreferenceKey.CURRENCY, currency.trim() || LOCAL_PREFERENCE_DEFAULTS.currency);
  }

  getOnboardingCompleted(): boolean {
    const value = this.getText(LocalPreferenceKey.ONBOARDING_COMPLETED);
    return value === '1' || value === 'true' ? true : LOCAL_PREFERENCE_DEFAULTS.onboardingCompleted;
  }

  setOnboardingCompleted(onboardingCompleted: boolean): void {
    this.setText(LocalPreferenceKey.ONBOARDING_COMPLETED, onboardingCompleted ? '1' : '0');
  }

  getTransactionsTableState<T>(): T | null {
    return this.getJson<T>(LocalPreferenceKey.TRANSACTIONS_TABLE_STATE);
  }

  setTransactionsTableState(value: unknown): void {
    this.setJson(LocalPreferenceKey.TRANSACTIONS_TABLE_STATE, value);
  }

  private getText(key: LocalPreferenceKey): string | undefined {
    if (!this.isBrowser) {
      return undefined;
    }

    try {
      const value = localStorage.getItem(key);
      if (!value) {
        return undefined;
      }

      const normalizedValue = value.trim();
      return normalizedValue.length > 0 ? normalizedValue : undefined;
    } catch {
      return undefined;
    }
  }

  private setText(key: LocalPreferenceKey, value: string): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore localStorage write errors (private mode, quota, etc.).
    }
  }

  private getJson<T>(key: LocalPreferenceKey): T | null {
    const value = this.getText(key);
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  private setJson(key: LocalPreferenceKey, value: unknown): void {
    if (!this.isBrowser) {
      return;
    }

    if (value === null || value === undefined) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore localStorage write errors (private mode, quota, etc.).
      }
      return;
    }

    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore localStorage write errors (private mode, quota, etc.).
    }
  }
}
