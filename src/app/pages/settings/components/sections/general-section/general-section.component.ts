import { Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { CurrencyFormatStyle } from '@/config/local-preferences.config';
import { I18nService } from '@/services/i18n.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { NumberFormatService } from '@/services/number-format.service';
import { ZardInputDirective } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';
import { EDarkModes, ZardDarkMode } from '@/shared/services/dark-mode';

const CUSTOM_CURRENCY_VALUE = '__custom__';
const DEFAULT_CUSTOM_CURRENCY_SYMBOL = 'CHF';
const COMMON_CURRENCY_SYMBOLS = ['€', '$', '£', '¥'] as const;
const CURRENCY_FORMAT_STYLE_VALUES: readonly CurrencyFormatStyle[] = ['US', 'EU_DOT', 'EU_SPACE'] as const;

@Component({
  selector: 'app-general-section',
  imports: [TranslatePipe, ZardInputDirective, ...ZardSelectImports],
  templateUrl: './general-section.component.html',
  styleUrl: './general-section.component.scss',
})
export class GeneralSectionComponent {
  protected readonly darkMode = inject(ZardDarkMode);
  protected readonly i18nService = inject(I18nService);
  protected readonly localPreferencesService = inject(LocalPreferencesService);
  protected readonly numberFormatService = inject(NumberFormatService);
  protected readonly customCurrencyValue = CUSTOM_CURRENCY_VALUE;
  protected readonly themeOptions = [EDarkModes.SYSTEM, EDarkModes.LIGHT, EDarkModes.DARK] as const;
  protected readonly commonCurrencySymbols = COMMON_CURRENCY_SYMBOLS;
  protected readonly currencyFormatStyleValues = CURRENCY_FORMAT_STYLE_VALUES;
  protected readonly languages = this.i18nService.supportedLanguages;
  protected readonly selectedTheme = this.darkMode.currentTheme;
  protected readonly selectedLanguage = this.i18nService.language;
  protected readonly selectedCurrencySymbol = this.localPreferencesService.currencyPreference;
  protected readonly selectedCurrencyFormatStyle = this.localPreferencesService.currencyFormatStylePreference;
  protected readonly selectedCurrencyOption = computed(() =>
    this.isCommonCurrencySymbol(this.selectedCurrencySymbol()) ? this.selectedCurrencySymbol() : CUSTOM_CURRENCY_VALUE,
  );
  protected readonly currencyFormatPreview = computed(() =>
    this.numberFormatService.formatNumber(1_234_567.89, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  );

  protected getLanguageLabelKey(language: string): string {
    return `header.language.options.${language}`;
  }

  protected themeOptionLabelKey(theme: EDarkModes): string {
    return `settings.general.cards.theme.options.${theme}`;
  }

  protected currencyFormatStyleLabelKey(style: CurrencyFormatStyle): string {
    return `settings.general.cards.numberFormat.options.${style}`;
  }

  protected onThemeChange(value: string | string[]): void {
    const selectedValue = this.asSingleValue(value);
    if (selectedValue === EDarkModes.SYSTEM || selectedValue === EDarkModes.LIGHT || selectedValue === EDarkModes.DARK) {
      this.darkMode.toggleTheme(selectedValue);
    }
  }

  protected onLanguageChange(value: string | string[]): void {
    const selectedValue = this.asSingleValue(value);
    if (selectedValue && this.languages.includes(selectedValue as (typeof this.languages)[number])) {
      void this.i18nService.use(selectedValue);
    }
  }

  protected onCurrencyOptionChange(value: string | string[]): void {
    const selectedValue = this.asSingleValue(value);
    if (!selectedValue) {
      return;
    }

    if (selectedValue === CUSTOM_CURRENCY_VALUE) {
      if (this.isCommonCurrencySymbol(this.selectedCurrencySymbol())) {
        this.localPreferencesService.setCurrency(DEFAULT_CUSTOM_CURRENCY_SYMBOL);
      }
      return;
    }

    this.localPreferencesService.setCurrency(selectedValue);
  }

  protected onCustomCurrencyInput(value: string): void {
    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
      return;
    }

    const normalizedValue = this.numberFormatService.normalizeCurrencySymbol(trimmedValue);
    this.localPreferencesService.setCurrency(normalizedValue);
  }

  protected onCustomCurrencyBlur(value: string): void {
    if (value.trim().length > 0) {
      return;
    }

    this.localPreferencesService.setCurrency(DEFAULT_CUSTOM_CURRENCY_SYMBOL);
  }

  protected onCurrencyFormatStyleChange(value: string | string[]): void {
    const selectedValue = this.asSingleValue(value);
    if (
      selectedValue === 'US'
      || selectedValue === 'EU_DOT'
      || selectedValue === 'EU_SPACE'
    ) {
      this.localPreferencesService.setCurrencyFormatStyle(selectedValue);
    }
  }

  private asSingleValue(value: string | string[]): string | null {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private isCommonCurrencySymbol(value: string): value is (typeof COMMON_CURRENCY_SYMBOLS)[number] {
    return COMMON_CURRENCY_SYMBOLS.includes(value as (typeof COMMON_CURRENCY_SYMBOLS)[number]);
  }
}
