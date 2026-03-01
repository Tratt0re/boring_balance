import {
  LOCAL_PREFERENCE_DEFAULTS,
  type CurrencyFormatStyle,
  type CurrencySymbol,
} from '@/config/local-preferences.config';

export interface AppNumberFormatOptions {
  readonly useGrouping?: boolean;
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
}

export interface AppNumberParseOptions {
  readonly allowNegative?: boolean;
  readonly allowDecimal?: boolean;
}

interface NumberFormatSeparators {
  readonly decimal: string;
  readonly thousands: string;
}

const DEFAULT_MAX_FRACTION_DIGITS = 2;
const CURRENCY_SYMBOL_ALIAS_BY_CODE = new Map<string, CurrencySymbol>([
  ['EUR', '€'],
  ['USD', '$'],
  ['GBP', '£'],
  ['JPY', '¥'],
  ['CNY', '¥'],
]);

export const NUMBER_FORMAT_SEPARATORS: Readonly<Record<CurrencyFormatStyle, NumberFormatSeparators>> = Object.freeze({
  US: {
    decimal: '.',
    thousands: ',',
  },
  EU_DOT: {
    decimal: ',',
    thousands: '.',
  },
  EU_SPACE: {
    decimal: ',',
    thousands: ' ',
  },
});

export function normalizeCurrencySymbol(value: unknown): CurrencySymbol {
  if (typeof value !== 'string') {
    return LOCAL_PREFERENCE_DEFAULTS.currency;
  }

  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    return LOCAL_PREFERENCE_DEFAULTS.currency;
  }

  const mappedSymbol = CURRENCY_SYMBOL_ALIAS_BY_CODE.get(normalizedValue.toUpperCase());
  if (mappedSymbol) {
    return mappedSymbol;
  }

  const compactValue = normalizedValue.slice(0, 3);
  return /^[A-Za-z]+$/.test(compactValue) ? compactValue.toUpperCase() : compactValue;
}

export function normalizeCurrencyFormatStyle(value: unknown): CurrencyFormatStyle {
  return value === 'US' || value === 'EU_DOT' || value === 'EU_SPACE'
    ? value
    : LOCAL_PREFERENCE_DEFAULTS.currencyFormatStyle;
}

export function resolveNumberFormatSeparators(style: CurrencyFormatStyle): NumberFormatSeparators {
  return NUMBER_FORMAT_SEPARATORS[style];
}

export function formatNumber(value: number, style: CurrencyFormatStyle, options: AppNumberFormatOptions = {}): string {
  if (!Number.isFinite(value)) {
    return `${value}`;
  }

  const normalizedMinimumFractionDigits = Math.max(0, Math.trunc(options.minimumFractionDigits ?? 0));
  const normalizedMaximumFractionDigits = Math.max(
    normalizedMinimumFractionDigits,
    Math.trunc(options.maximumFractionDigits ?? DEFAULT_MAX_FRACTION_DIGITS),
  );
  const absoluteValue = Math.abs(value);
  const roundedValue = absoluteValue.toFixed(normalizedMaximumFractionDigits);
  let [integerPart, fractionPart = ''] = roundedValue.split('.');

  if (normalizedMaximumFractionDigits > normalizedMinimumFractionDigits) {
    const trimmedFraction = fractionPart.replace(/0+$/g, '');
    fractionPart =
      trimmedFraction.length >= normalizedMinimumFractionDigits
        ? trimmedFraction
        : trimmedFraction.padEnd(normalizedMinimumFractionDigits, '0');
  }

  const separators = resolveNumberFormatSeparators(style);
  const groupedIntegerPart =
    options.useGrouping === false ? integerPart : integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, separators.thousands);
  const signedIntegerPart = value < 0 ? `-${groupedIntegerPart}` : groupedIntegerPart;

  if (fractionPart.length === 0) {
    return signedIntegerPart;
  }

  return `${signedIntegerPart}${separators.decimal}${fractionPart}`;
}

export function formatCurrency(
  value: number,
  symbol: CurrencySymbol,
  style: CurrencyFormatStyle,
  options: AppNumberFormatOptions = {},
): string {
  if (!Number.isFinite(value)) {
    return `${value}`;
  }

  const normalizedSymbol = normalizeCurrencySymbol(symbol);
  const formattedNumber = formatNumber(Math.abs(value), style, {
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
    useGrouping: options.useGrouping,
  });
  const separator = normalizedSymbol.length > 1 ? ' ' : '';
  const signPrefix = value < 0 ? '-' : '';

  return `${signPrefix}${normalizedSymbol}${separator}${formattedNumber}`;
}

export function formatPercent(
  value: number,
  style: CurrencyFormatStyle,
  options: AppNumberFormatOptions = {},
): string {
  return `${formatNumber(value, style, options)}%`;
}

export function normalizeLocalizedNumericInput(
  value: unknown,
  style: CurrencyFormatStyle,
  options: AppNumberParseOptions = {},
): string {
  const allowNegative = options.allowNegative ?? true;
  const allowDecimal = options.allowDecimal ?? true;
  const separators = resolveNumberFormatSeparators(style);
  const decimalSeparator = separators.decimal;
  const thousandsSeparator = separators.thousands;

  let text = `${value ?? ''}`.replaceAll('\u00A0', ' ').trim();
  if (text.length === 0) {
    return '';
  }

  const isNegative = allowNegative && text.startsWith('-');
  text = text.replaceAll('-', '');

  if (thousandsSeparator === ' ') {
    text = text.replace(/\s+/g, '');
  } else {
    text = text.replaceAll(thousandsSeparator, '');
    text = text.replace(/\s+/g, '');
  }

  if (!allowDecimal) {
    const integerDigits = text.replace(/\D+/g, '');
    if (integerDigits.length === 0) {
      return isNegative ? '-' : '';
    }

    return isNegative ? `-${integerDigits}` : integerDigits;
  }

  const decimalParts = text.split(decimalSeparator);
  const rawIntegerPart = decimalParts.shift() ?? '';
  const integerDigits = rawIntegerPart.replace(/\D+/g, '');
  const hadDecimalSeparator = decimalParts.length > 0;
  const fractionDigits = decimalParts.join('').replace(/\D+/g, '');

  if (integerDigits.length === 0 && !hadDecimalSeparator && fractionDigits.length === 0) {
    return isNegative ? '-' : '';
  }

  const normalizedIntegerPart = integerDigits.length > 0 ? integerDigits : '0';
  const unsignedValue = hadDecimalSeparator
    ? `${normalizedIntegerPart}.${fractionDigits}`
    : normalizedIntegerPart;
  const normalizedValue = isNegative && unsignedValue !== '0' && unsignedValue !== '0.'
    ? `-${unsignedValue}`
    : unsignedValue;

  return normalizedValue;
}

export function parseLocalizedNumber(
  value: unknown,
  style: CurrencyFormatStyle,
  options: AppNumberParseOptions = {},
): number | null {
  const normalizedValue = normalizeLocalizedNumericInput(value, style, options);
  if (
    normalizedValue.length === 0 ||
    normalizedValue === '-' ||
    normalizedValue === '.' ||
    normalizedValue === '-.'
  ) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}
