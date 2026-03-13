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
    description:
      'Runs on Windows, macOS, and Linux.',
    icon: Monitor,
  },
  {
    label: 'Local-first',
    description: 'Your data stays in SQLite on your machine.',
    icon: Database,
  },
  {
    label: 'No account needed',
    description: 'No sign-up. No subscription.',
    icon: UserX,
  },
  {
    label: 'Open source',
    description: 'Download it, inspect it, build it.',
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
      <div class="max-w-3xl">
        <h2 id="feature-strip-heading" class="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Everything you need. Nothing extra.
        </h2>
        <p class="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
          Track money clearly. Keep your data local.
        </p>
      </div>

      <ul class="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4" role="list">
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
