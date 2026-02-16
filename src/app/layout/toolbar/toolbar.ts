import { Component, input, output, ViewEncapsulation } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { SidebarToggleComponent } from '@/components/sidebar-toggle/sidebar-toggle.component';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDividerComponent } from '@/shared/components/divider';
import { ZardIconComponent } from '@/shared/components/icon';
import { HeaderComponent } from '@/shared/components/layout/header.component';
import type { ToolbarAction } from '@/services/toolbar-context.service';

@Component({
  selector: 'app-toolbar',
  imports: [
    HeaderComponent,
    SidebarToggleComponent,
    TranslatePipe,
    ZardButtonComponent,
    ZardDividerComponent,
    ZardIconComponent,
  ],
  templateUrl: './toolbar.html',
  encapsulation: ViewEncapsulation.None,
})
export class Toolbar {
  readonly sidebarCollapsed = input(false);
  readonly title = input<string | null>(null);
  readonly actions = input<readonly ToolbarAction[]>([]);
  readonly sidebarToggle = output<void>();

  protected onSidebarToggle(): void {
    this.sidebarToggle.emit();
  }

  protected isActionDisabled(action: ToolbarAction): boolean {
    if (typeof action.disabled === 'function') {
      return action.disabled();
    }

    return action.disabled ?? false;
  }

  protected onActionClick(action: ToolbarAction): void {
    if (this.isActionDisabled(action)) {
      return;
    }

    try {
      const result = action.action();
      if (result && typeof result.then === 'function') {
        void result.catch((error) => {
          console.error('[toolbar] Toolbar action failed:', error);
        });
      }
    } catch (error) {
      console.error('[toolbar] Toolbar action failed:', error);
    }
  }
}
