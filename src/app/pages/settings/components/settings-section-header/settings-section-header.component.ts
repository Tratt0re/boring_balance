import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-settings-section-header',
  imports: [TranslatePipe],
  template: `
    <header class="border-b border-border/60 pb-4">
      <h2 class="text-lg font-semibold tracking-tight">
        {{ titleKey() | translate }}
      </h2>
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsSectionHeaderComponent {
  readonly titleKey = input.required<string>();
}
