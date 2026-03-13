import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { LucideAngularModule, LucideIconData, Monitor, Database, UserX, GitBranch } from 'lucide-angular';

interface Feature {
  label: string;
  description: string;
  icon: LucideIconData;
}

const FEATURES: Feature[] = [
  {
    label: 'Desktop workflow',
    description: 'Keyboard-friendly and built for deliberate review on Windows, macOS, and Linux.',
    icon: Monitor,
  },
  {
    label: 'Single local file',
    description: 'Your data stays in SQLite on your machine, not in someone else’s service.',
    icon: Database,
  },
  {
    label: 'No account layer',
    description: 'No sign-up, no subscription, and no background sync requirement.',
    icon: UserX,
  },
  {
    label: 'Open source',
    description: 'Download it, read it, and verify how it works.',
    icon: GitBranch,
  },
];

@Component({
  selector: 'app-feature-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [LucideAngularModule],
  template: `
    <section
      aria-labelledby="feature-strip-heading"
      class="mx-auto w-full max-w-6xl border-t border-border px-6 py-12 sm:px-10 sm:py-14"
    >
      <div class="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)] lg:items-start">
        <div class="max-w-2xl">
          <h2
            id="feature-strip-heading"
            class="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
          >
            Built for deliberate bookkeeping.
          </h2>
          <p class="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
            The product stays spare on purpose. The useful parts stay close, and the rest stays
            out of your way.
          </p>
        </div>

        <ul class="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2" role="list">
        @for (feature of features; track feature.label; let index = $index) {
          <li class="border-t border-border pt-4">
            <div class="flex items-start gap-3">
              <span class="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
              <lucide-icon [img]="feature.icon" [size]="16" aria-hidden="true" />
              </span>
              <div class="min-w-0">
                <h3 class="text-sm font-medium text-foreground">{{ feature.label }}</h3>
                <p class="mt-1 text-sm leading-6 text-muted-foreground">{{ feature.description }}</p>
              </div>
            </div>
          </li>
        }
        </ul>
      </div>
    </section>
  `,
})
export class FeatureStripComponent {
  protected readonly features = FEATURES;
}
