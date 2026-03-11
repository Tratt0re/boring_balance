import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, inject, input, OnInit, output, signal, ViewChild, ViewEncapsulation } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { I18nService } from '@/services/i18n.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardButtonComponent } from '@/shared/components/button';
import { EDarkModes, ZardDarkMode } from '@/shared/services/dark-mode';
import { applyThemeTransition } from '@/shared/utils/theme-transition';
import type { ThemePreference } from '@/config/local-preferences.config';

const COMMON_CURRENCY_SYMBOLS = ['€', '$', '£', '¥'] as const;

export interface PreferencesData {
  theme: ThemePreference;
  language: string;
  currency: string;
}

@Component({
  selector: 'app-onboarding-preferences',
  imports: [TranslatePipe, ZardButtonComponent, ...ZardSelectImports],
  template: `
    <div>
      <h2 class="text-xl font-semibold tracking-tight" #heading tabindex="-1">
        {{ 'onboarding.preferences.title' | translate }}
      </h2>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ 'onboarding.preferences.subtitle' | translate }}
      </p>

      <div class="mt-6 space-y-5">
        <div>
          <label class="mb-1 block text-sm font-medium" for="onboarding-theme">
            {{ 'onboarding.preferences.theme.label' | translate }}
          </label>
          <z-select
            id="onboarding-theme"
            [zValue]="selectedTheme()"
            (zSelectionChange)="onThemeChange($event)"
          >
            @for (theme of themeOptions; track theme) {
              <z-select-item
                [zValue]="theme"
                [zLabel]="themeOptionLabelKey(theme) | translate"
                [zIcon]="themeOptionIcon(theme)"
              />
            }
          </z-select>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium" for="onboarding-language">
            {{ 'onboarding.preferences.language.label' | translate }}
          </label>
          <z-select
            id="onboarding-language"
            [zValue]="selectedLanguage()"
            (zSelectionChange)="onLanguageChange($event)"
          >
            @for (language of languages; track language) {
              <z-select-item [zValue]="language" [zLabel]="getLanguageLabel(language)" />
            }
          </z-select>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium" for="onboarding-currency">
            {{ 'onboarding.preferences.currency.label' | translate }}
          </label>
          <z-select
            id="onboarding-currency"
            [zValue]="selectedCurrency()"
            (zSelectionChange)="onCurrencyChange($event)"
          >
            @for (symbol of currencySymbols; track symbol) {
              <z-select-item [zValue]="symbol" [zLabel]="symbol" />
            }
          </z-select>
          <p class="mt-1.5 text-xs text-muted-foreground">
            {{ 'onboarding.preferences.currency.hint' | translate }}
          </p>
        </div>
      </div>

      <div class="mt-8 flex justify-between">
        <button z-button zType="ghost" (click)="back.emit()">
          {{ 'onboarding.actions.back' | translate }}
        </button>
        <button z-button (click)="onContinue()">
          {{ 'onboarding.actions.continue' | translate }}
        </button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class OnboardingPreferencesComponent implements OnInit, AfterViewInit {
  @ViewChild('heading') headingRef?: ElementRef<HTMLElement>;

  private readonly darkMode = inject(ZardDarkMode);
  private readonly i18nService = inject(I18nService);
  private readonly localPreferencesService = inject(LocalPreferencesService);

  readonly initialData = input<PreferencesData | null>(null);
  readonly advance = output<PreferencesData>();
  readonly back = output<void>();

  protected readonly themeOptions = [EDarkModes.SYSTEM, EDarkModes.LIGHT, EDarkModes.DARK] as const;
  protected readonly languages = this.i18nService.supportedLanguages;
  protected readonly currencySymbols = COMMON_CURRENCY_SYMBOLS;

  protected readonly selectedTheme = signal<ThemePreference>('system');
  protected readonly selectedLanguage = signal<string>('en');
  protected readonly selectedCurrency = signal<string>('€');

  ngAfterViewInit(): void {
    this.headingRef?.nativeElement.focus();
  }

  ngOnInit(): void {
    const data = this.initialData();
    this.selectedTheme.set(data?.theme ?? (this.localPreferencesService.getTheme() as ThemePreference));
    this.selectedLanguage.set(data?.language ?? this.localPreferencesService.getLanguage());
    this.selectedCurrency.set(data?.currency ?? this.localPreferencesService.getCurrency());
  }

  protected getLanguageLabel(lang: string): string {
    const labels: Record<string, string> = { en: 'English', it: 'Italiano', es: 'Español' };
    return labels[lang] ?? lang;
  }

  protected themeOptionLabelKey(theme: EDarkModes): string {
    return `settings.general.cards.theme.options.${theme}`;
  }

  protected themeOptionIcon(theme: EDarkModes): 'monitor' | 'sun' | 'moon' {
    if (theme === EDarkModes.SYSTEM) return 'monitor';
    return theme === EDarkModes.DARK ? 'moon' : 'sun';
  }

  protected onThemeChange(value: string | string[]): void {
    const v = this.asString(value);
    if (v === 'light' || v === 'dark' || v === 'system') {
      this.selectedTheme.set(v);
      applyThemeTransition(this.darkMode, { targetMode: v });
    }
  }

  protected onLanguageChange(value: string | string[]): void {
    const v = this.asString(value);
    if (v && this.languages.includes(v as (typeof this.languages)[number])) {
      this.selectedLanguage.set(v);
      void this.i18nService.use(v);
    }
  }

  protected onCurrencyChange(value: string | string[]): void {
    const v = this.asString(value);
    if (v) {
      this.selectedCurrency.set(v);
    }
  }

  protected onContinue(): void {
    this.advance.emit({
      theme: this.selectedTheme(),
      language: this.selectedLanguage(),
      currency: this.selectedCurrency(),
    });
  }

  private asString(value: string | string[]): string {
    return Array.isArray(value) ? (value[0] ?? '') : value;
  }
}
