import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { I18nService } from '@/services/i18n.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { ZardDarkMode } from '@/shared/services/dark-mode';
import { applyThemeTransition } from '@/shared/utils/theme-transition';

import { OnboardingWelcomeComponent } from './steps/onboarding-welcome.component';
import { OnboardingPreferencesComponent, type PreferencesData } from './steps/onboarding-preferences.component';
import { OnboardingStartComponent, type StartData, type StartMode } from './steps/onboarding-start.component';
import { OnboardingConfirmComponent } from './steps/onboarding-confirm.component';
import type { ThemePreference } from '@/config/local-preferences.config';

const TOTAL_STEPS = 4;

interface OnboardingState {
  theme: ThemePreference;
  language: string;
  currency: string;
  startMode: StartMode;
}

@Component({
  selector: 'app-onboarding',
  imports: [
    TranslatePipe,
    OnboardingWelcomeComponent,
    OnboardingPreferencesComponent,
    OnboardingStartComponent,
    OnboardingConfirmComponent,
  ],
  template: `
    <div class="fixed inset-0 z-50 flex flex-col bg-background">
      <div class="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div class="w-full max-w-lg">
          @if (currentStep() > 1) {
            <p class="mb-6 text-sm text-muted-foreground" aria-live="polite">
              {{ 'onboarding.step_counter' | translate: { current: currentStep(), total: totalSteps } }}
            </p>
          }

          <div class="transition-opacity duration-200">
            @if (currentStep() === 1) {
              <app-onboarding-welcome (advance)="onWelcomeAdvance()" />
            }
            @if (currentStep() === 2) {
              <app-onboarding-preferences
                [initialData]="preferencesData()"
                (advance)="onPreferencesAdvance($event)"
                (back)="goBack()"
              />
            }
            @if (currentStep() === 3) {
              <app-onboarding-start
                [initialMode]="state().startMode"
                (advance)="onStartAdvance($event)"
                (back)="goBack()"
              />
            }
            @if (currentStep() === 4) {
              <app-onboarding-confirm
                [startMode]="state().startMode"
                (advance)="onComplete()"
              />
            }
          </div>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class OnboardingComponent {
  private readonly router = inject(Router);
  private readonly localPreferences = inject(LocalPreferencesService);
  private readonly i18nService = inject(I18nService);
  private readonly darkMode = inject(ZardDarkMode);

  protected readonly totalSteps = TOTAL_STEPS;
  protected readonly currentStep = signal(1);
  protected readonly state = signal<OnboardingState>({
    theme: 'system',
    language: this.localPreferences.getLanguage(),
    currency: this.localPreferences.getCurrency(),
    startMode: 'scratch',
  });

  protected readonly preferencesData = computed(() => {
    const s = this.state();
    return { theme: s.theme, language: s.language, currency: s.currency };
  });

  protected onWelcomeAdvance(): void {
    this.currentStep.set(2);
  }

  protected onPreferencesAdvance(data: PreferencesData): void {
    this.state.update((s) => ({ ...s, ...data }));
    this.currentStep.set(3);
  }

  protected onStartAdvance(data: StartData): void {
    this.state.update((s) => ({ ...s, startMode: data.startMode }));
    this.currentStep.set(4);
  }

  protected goBack(): void {
    this.currentStep.update((step) => Math.max(1, step - 1));
  }

  protected onComplete(): void {
    const { theme, language, currency, startMode } = this.state();

    applyThemeTransition(this.darkMode, { targetMode: theme });
    void this.i18nService.use(language);
    this.localPreferences.setCurrency(currency);
    this.localPreferences.setOnboardingCompleted(true);

    if (startMode === 'import') {
      void this.router.navigate(['/settings/backups']);
    } else {
      void this.router.navigate(['/']);
    }
  }
}
