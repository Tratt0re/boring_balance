import { computed, inject, Injectable } from '@angular/core';

import type { CurrencySymbol } from '@/config/local-preferences.config';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  normalizeCurrencySymbol,
  normalizeLocalizedNumericInput,
  parseLocalizedNumber,
  type AppNumberFormatOptions,
  type AppNumberParseOptions,
} from '@/shared/utils/number-format';

import { LocalPreferencesService } from './local-preferences.service';

@Injectable({
  providedIn: 'root',
})
export class NumberFormatService {
  private readonly localPreferencesService = inject(LocalPreferencesService);

  readonly currencySymbol = this.localPreferencesService.currencyPreference;
  readonly currencyFormatStyle = this.localPreferencesService.currencyFormatStylePreference;
  readonly amountPlaceholder = computed(() =>
    this.formatNumber(0, {
      useGrouping: false,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  );

  formatNumber(value: number, options: AppNumberFormatOptions = {}): string {
    return formatNumber(value, this.currencyFormatStyle(), options);
  }

  formatCurrency(
    value: number,
    symbol: CurrencySymbol = this.currencySymbol(),
    options: AppNumberFormatOptions = {},
  ): string {
    return formatCurrency(value, symbol, this.currencyFormatStyle(), options);
  }

  formatPercent(value: number, options: AppNumberFormatOptions = {}): string {
    return formatPercent(value, this.currencyFormatStyle(), options);
  }

  normalizeInput(value: unknown, options: AppNumberParseOptions = {}): string {
    return normalizeLocalizedNumericInput(value, this.currencyFormatStyle(), options);
  }

  parse(value: unknown, options: AppNumberParseOptions = {}): number | null {
    return parseLocalizedNumber(value, this.currencyFormatStyle(), options);
  }

  normalizeCurrencySymbol(value: unknown): CurrencySymbol {
    return normalizeCurrencySymbol(value);
  }
}
