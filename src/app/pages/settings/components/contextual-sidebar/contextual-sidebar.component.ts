import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { SettingsNavItem, SettingsSectionKey } from '../../models/settings-nav.models';

@Component({
  selector: 'app-contextual-sidebar',
  imports: [TranslatePipe],
  templateUrl: './contextual-sidebar.component.html',
  styleUrl: './contextual-sidebar.component.scss',
})
export class ContextualSidebarComponent {
  readonly items = input.required<readonly SettingsNavItem[]>();
  readonly activeKey = input.required<SettingsSectionKey>();

  readonly keySelected = output<SettingsSectionKey>();

  protected onSelect(key: SettingsSectionKey): void {
    if (key === this.activeKey()) {
      return;
    }

    this.keySelected.emit(key);
  }
}
