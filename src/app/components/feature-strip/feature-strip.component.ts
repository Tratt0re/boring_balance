import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { LucideAngularModule, LucideIconData, Monitor, Database, UserX, GitBranch } from 'lucide-angular';

interface Feature {
  label: string;
  description: string;
  icon: LucideIconData;
}

const FEATURES: Feature[] = [
  {
    label: 'Desktop-first',
    description: 'Runs locally on your machine. No browser, no web app, no SaaS.',
    icon: Monitor,
  },
  {
    label: 'Local data only',
    description: 'Your data lives in a SQLite file on your disk. No cloud sync, ever.',
    icon: Database,
  },
  {
    label: 'No account needed',
    description: 'Open the app and start tracking. Zero sign-up, zero onboarding friction.',
    icon: UserX,
  },
  {
    label: 'Open source',
    description: 'Inspect the code, build it yourself, or contribute. MIT licensed.',
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
      aria-label="Features"
      class="mx-auto w-full max-w-6xl border-t border-border px-6 py-12 sm:px-10"
    >
      <ul class="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4" role="list">
        @for (feature of features; track feature.label) {
          <li class="flex flex-col gap-3">
            <span class="flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground">
              <lucide-icon [img]="feature.icon" [size]="16" aria-hidden="true" />
            </span>
            <div>
              <h3 class="text-sm font-medium text-foreground">{{ feature.label }}</h3>
              <p class="mt-1 text-sm leading-6 text-muted-foreground">{{ feature.description }}</p>
            </div>
          </li>
        }
      </ul>
    </section>
  `,
})
export class FeatureStripComponent {
  protected readonly features = FEATURES;
}
