import type { TranslateService } from '@ngx-translate/core';

/**
 * Attempts to translate a value. If the translation key does not exist
 * (i.e. the service returns the key itself), the original value is returned.
 * Useful for values that may or may not be i18n keys (e.g. user-created names).
 */
export function translateMaybe(translateService: TranslateService, value: string): string {
  const translated = translateService.instant(value);
  return translated !== value ? translated : value;
}

/**
 * Picks the key that carries the wording for a count. The locale files hold one key per plural
 * category (`<key>_one`, `<key>_other`, plus `_few` / `_many` where the language needs them), and
 * the category comes from `Intl.PluralRules`, so each language follows its own rules. A category a
 * language does not define falls back to `<key>_other`.
 */
export function pluralKey(translateService: TranslateService, key: string, count: number): string {
  const language = translateService.getCurrentLang() || translateService.getFallbackLang() || 'en';
  const categoryKey = `${key}_${new Intl.PluralRules(language).select(count)}`;

  return translateService.instant(categoryKey) !== categoryKey ? categoryKey : `${key}_other`;
}

/** Reads as "Every month" for an interval of 1 and "Every 3 weeks" otherwise. */
export function describeFrequency(
  translateService: TranslateService,
  frequency: { readonly interval: number; readonly unit: string },
): string {
  return frequency.interval === 1
    ? translateService.instant(`recurringEvents.frequency.every.${frequency.unit}`)
    : translatePlural(
        translateService,
        `recurringEvents.frequency.everyN.${frequency.unit}`,
        frequency.interval,
      );
}

/** Translates a message whose wording depends on a count; `{{count}}` is filled in for you. */
export function translatePlural(
  translateService: TranslateService,
  key: string,
  count: number,
  params: Record<string, unknown> = {},
): string {
  return translateService.instant(pluralKey(translateService, key, count), { ...params, count });
}
