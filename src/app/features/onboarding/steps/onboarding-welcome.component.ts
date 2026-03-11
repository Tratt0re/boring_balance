import { ChangeDetectionStrategy, Component, output, ViewEncapsulation } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ZardButtonComponent } from '@/shared/components/button';

@Component({
  selector: 'app-onboarding-welcome',
  imports: [TranslatePipe, ZardButtonComponent],
  template: `
    <div class="flex flex-col items-center text-center">
      <h1 class="text-2xl font-semibold tracking-tight" tabindex="-1">
        {{ 'onboarding.welcome.title' | translate }}
      </h1>
      <p class="mt-3 text-sm text-muted-foreground">
        {{ 'onboarding.welcome.subtitle' | translate }}
      </p>
      <button z-button class="mt-8" (click)="advance.emit()">
        {{ 'onboarding.welcome.cta' | translate }}
      </button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class OnboardingWelcomeComponent {
  readonly advance = output<void>();
}
