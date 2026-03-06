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
