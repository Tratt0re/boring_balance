import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

import {
  LOCAL_PREFERENCE_DEFAULTS,
  type CurrencyFormatStyle,
  LocalPreferenceKey,
  type ThemePreference,
} from '@/config/local-preferences.config';
import {
  normalizeCurrencyFormatStyle,
  normalizeCurrencySymbol,
} from '@/shared/utils/number-format';

@Injectable({
  providedIn: 'root',
})
export class LocalPreferencesService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly themePreferenceSignal = signal<ThemePreference>(LOCAL_PREFERENCE_DEFAULTS.theme);
  private readonly languagePreferenceSignal = signal<string>(LOCAL_PREFERENCE_DEFAULTS.language);
  private readonly currencyPreferenceSignal = signal<string>(LOCAL_PREFERENCE_DEFAULTS.currency);
  private readonly currencyFormatStyleSignal = signal<CurrencyFormatStyle>(
    LOCAL_PREFERENCE_DEFAULTS.currencyFormatStyle,
  );

  readonly themePreference = this.themePreferenceSignal.asReadonly();
  readonly languagePreference = this.languagePreferenceSignal.asReadonly();
  readonly currencyPreference = this.currencyPreferenceSignal.asReadonly();
  readonly currencyFormatStylePreference = this.currencyFormatStyleSignal.asReadonly();

  init(): void {
    if (!this.isBrowser) {
      return;
    }

    this.setTheme(this.getTheme());
    this.setThemeColor(this.getThemeColor());
    this.setLanguage(this.getLanguage());
    this.setCurrency(this.getCurrency());
    this.setCurrencyFormatStyle(this.getCurrencyFormatStyle());
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
    const normalizedTheme: ThemePreference =
      theme === 'light' || theme === 'dark' || theme === 'system' ? theme : LOCAL_PREFERENCE_DEFAULTS.theme;

    this.themePreferenceSignal.set(normalizedTheme);
    this.setText(LocalPreferenceKey.THEME, normalizedTheme);
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
    const normalizedLanguage = language.trim() || LOCAL_PREFERENCE_DEFAULTS.language;
    this.languagePreferenceSignal.set(normalizedLanguage);
    this.setText(LocalPreferenceKey.LANGUAGE, normalizedLanguage);
  }

  getCurrency(): string {
    return normalizeCurrencySymbol(this.getText(LocalPreferenceKey.CURRENCY));
  }

  setCurrency(currency: string): void {
    const normalizedCurrency = normalizeCurrencySymbol(currency);
    this.currencyPreferenceSignal.set(normalizedCurrency);
    this.setText(LocalPreferenceKey.CURRENCY, normalizedCurrency);
  }

  getCurrencyFormatStyle(): CurrencyFormatStyle {
    return normalizeCurrencyFormatStyle(this.getText(LocalPreferenceKey.CURRENCY_FORMAT_STYLE));
  }

  setCurrencyFormatStyle(currencyFormatStyle: CurrencyFormatStyle): void {
    const normalizedCurrencyFormatStyle = normalizeCurrencyFormatStyle(currencyFormatStyle);
    this.currencyFormatStyleSignal.set(normalizedCurrencyFormatStyle);
    this.setText(LocalPreferenceKey.CURRENCY_FORMAT_STYLE, normalizedCurrencyFormatStyle);
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

  getTransfersTableState<T>(): T | null {
    return this.getJson<T>(LocalPreferenceKey.TRANSFERS_TABLE_STATE);
  }

  setTransfersTableState(value: unknown): void {
    this.setJson(LocalPreferenceKey.TRANSFERS_TABLE_STATE, value);
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
