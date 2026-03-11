import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, input, output, ViewChild, ViewEncapsulation } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardIconComponent } from '@/shared/components/icon/icon.component';
import type { StartMode } from './onboarding-start.component';

@Component({
  selector: 'app-onboarding-confirm',
  imports: [TranslatePipe, ZardButtonComponent, ZardIconComponent],
  template: `
    <div class="flex flex-col items-center text-center">
      <z-icon zType="circle-check" class="size-10 text-muted-foreground" />

      <h2 #heading class="mt-4 text-xl font-semibold tracking-tight" tabindex="-1">
        {{ 'onboarding.confirm.title' | translate }}
      </h2>
      <p class="mt-2 text-sm text-muted-foreground">
        {{ 'onboarding.confirm.subtitle' | translate }}
      </p>

      @if (startMode() === 'import') {
        <p class="mt-4 text-sm text-muted-foreground">
          {{ 'onboarding.confirm.import_note' | translate }}
        </p>
      }

      <button z-button class="mt-8" (click)="advance.emit()">
        {{ 'onboarding.confirm.cta' | translate }}
      </button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class OnboardingConfirmComponent implements AfterViewInit {
  @ViewChild('heading') headingRef?: ElementRef<HTMLElement>;

  readonly startMode = input<StartMode>('scratch');
  readonly advance = output<void>();

  ngAfterViewInit(): void {
    this.headingRef?.nativeElement.focus();
  }
}
