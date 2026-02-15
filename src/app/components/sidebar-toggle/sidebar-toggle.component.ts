import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardIconComponent } from '@/shared/components/icon';

@Component({
  selector: 'app-sidebar-toggle',
  imports: [ZardButtonComponent, ZardIconComponent, TranslatePipe],
  templateUrl: './sidebar-toggle.component.html',
})
export class SidebarToggleComponent {
  readonly sidebarCollapsed = input(false);
  readonly toggle = output<void>();

  protected onToggle(): void {
    this.toggle.emit();
  }
}
