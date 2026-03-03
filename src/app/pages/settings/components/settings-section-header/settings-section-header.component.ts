import { Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-settings-section-header',
  imports: [TranslatePipe],
  template: `
    <header class="rounded-lg border border-border/60 bg-card p-4 mb-2">
      <h2 class="text-base font-semibold tracking-tight">
        {{ titleKey() | translate }}
      </h2>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ descriptionKey() | translate }}
      </p>
    </header>
  `,
})
export class SettingsSectionHeaderComponent {
  readonly titleKey = input.required<string>();
  readonly descriptionKey = input.required<string>();
}
