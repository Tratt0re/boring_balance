import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, input, OnInit, output, signal, ViewChild, ViewEncapsulation } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardIconComponent } from '@/shared/components/icon/icon.component';

export type StartMode = 'scratch' | 'import';

export interface StartData {
  startMode: StartMode;
}

@Component({
  selector: 'app-onboarding-start',
  imports: [TranslatePipe, ZardButtonComponent, ZardIconComponent],
  template: `
    <div>
      <h2 #heading class="text-xl font-semibold tracking-tight" tabindex="-1">
        {{ 'onboarding.start.title' | translate }}
      </h2>

      <div class="mt-6" role="radiogroup" [attr.aria-label]="'onboarding.start.title' | translate">
        <div class="space-y-3">
          <button
            type="button"
            role="radio"
            [attr.aria-checked]="selectedMode() === 'scratch'"
            class="w-full rounded-[--radius] border p-4 text-left transition-colors duration-150"
            [class.border-foreground]="selectedMode() === 'scratch'"
            [class.ring-1]="selectedMode() === 'scratch'"
            [class.ring-foreground]="selectedMode() === 'scratch'"
            [class.border-border]="selectedMode() !== 'scratch'"
            (click)="selectedMode.set('scratch')"
          >
            <div class="flex items-start gap-3">
              <z-icon zType="pencil-line" class="mt-0.5 shrink-0 text-foreground" />
              <div>
                <p class="text-sm font-medium">{{ 'onboarding.start.scratch.title' | translate }}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">{{ 'onboarding.start.scratch.description' | translate }}</p>
              </div>
            </div>
          </button>

          <button
            type="button"
            role="radio"
            [attr.aria-checked]="selectedMode() === 'import'"
            class="w-full rounded-[--radius] border p-4 text-left transition-colors duration-150"
            [class.border-foreground]="selectedMode() === 'import'"
            [class.ring-1]="selectedMode() === 'import'"
            [class.ring-foreground]="selectedMode() === 'import'"
            [class.border-border]="selectedMode() !== 'import'"
            (click)="selectedMode.set('import')"
          >
            <div class="flex items-start gap-3">
              <z-icon zType="file-up" class="mt-0.5 shrink-0 text-foreground" />
              <div>
                <p class="text-sm font-medium">{{ 'onboarding.start.import.title' | translate }}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">{{ 'onboarding.start.import.description' | translate }}</p>
              </div>
            </div>
          </button>
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
export class OnboardingStartComponent implements OnInit, AfterViewInit {
  @ViewChild('heading') headingRef?: ElementRef<HTMLElement>;

  readonly initialMode = input<StartMode>('scratch');
  readonly advance = output<StartData>();
  readonly back = output<void>();

  protected readonly selectedMode = signal<StartMode>('scratch');

  ngOnInit(): void {
    this.selectedMode.set(this.initialMode());
  }

  ngAfterViewInit(): void {
    this.headingRef?.nativeElement.focus();
  }

  protected onContinue(): void {
    this.advance.emit({ startMode: this.selectedMode() });
  }
}
