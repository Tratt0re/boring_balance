import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

import { LocalPreferencesService } from '@/services/local-preferences.service';

export const SUPPORTED_LANGUAGES = ['en', 'es', 'it'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const DEFAULT_LANGUAGE: AppLanguage = 'en';

@Injectable({
  providedIn: 'root',
})
export class I18nService {
  private readonly translate = inject(TranslateService);
  private readonly localPreferencesService = inject(LocalPreferencesService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly activeLanguageSignal = signal<AppLanguage>(DEFAULT_LANGUAGE);

  readonly supportedLanguages = SUPPORTED_LANGUAGES;
  readonly language = this.activeLanguageSignal.asReadonly();

  async init(): Promise<void> {
    this.translate.addLangs([...SUPPORTED_LANGUAGES]);
    this.translate.setFallbackLang(DEFAULT_LANGUAGE);

    const preferredLanguage = this.resolveInitialLanguage();
    await this.use(preferredLanguage);
  }

  async use(language: string): Promise<void> {
    const normalizedLanguage = this.normalizeLanguage(language);

    try {
      await firstValueFrom(this.translate.use(normalizedLanguage));
      this.activeLanguageSignal.set(normalizedLanguage);

      if (this.isBrowser) {
        this.localPreferencesService.setLanguage(normalizedLanguage);
      }
    } catch (error) {
      if (normalizedLanguage !== DEFAULT_LANGUAGE) {
        await this.use(DEFAULT_LANGUAGE);
        return;
      }

      console.warn('[app] Failed to load translation files:', error);
    }
  }

  private normalizeLanguage(language?: string): AppLanguage {
    if (!language) {
      return DEFAULT_LANGUAGE;
    }

    const normalizedLanguage = language.trim().toLowerCase();
    if (this.supportedLanguages.includes(normalizedLanguage as AppLanguage)) {
      return normalizedLanguage as AppLanguage;
    }

    const baseLanguage = normalizedLanguage.split(/[-_]/)[0] ?? normalizedLanguage;
    return this.supportedLanguages.includes(baseLanguage as AppLanguage)
      ? (baseLanguage as AppLanguage)
      : DEFAULT_LANGUAGE;
  }

  private resolveInitialLanguage(): AppLanguage {
    if (this.localPreferencesService.hasLanguagePreference()) {
      return this.normalizeLanguage(this.localPreferencesService.getLanguage());
    }

    if (!this.isBrowser) {
      return DEFAULT_LANGUAGE;
    }

    return this.normalizeLanguage(this.translate.getBrowserCultureLang() ?? this.translate.getBrowserLang());
  }
}
