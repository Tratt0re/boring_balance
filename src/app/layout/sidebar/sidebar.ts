import { Component, input, output, ViewEncapsulation } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { ZardIconComponent } from '@/shared/components/icon';
import {
  SidebarComponent,
  SidebarGroupComponent,
  SidebarGroupLabelComponent,
} from '@/shared/components/layout/sidebar.component';

import type { MenuSectionConfig } from '@/config/menu.config';

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    RouterLinkActive,
    ZardIconComponent,
    SidebarComponent,
    SidebarGroupComponent,
    SidebarGroupLabelComponent,
  ],
  templateUrl: './sidebar.html',
  encapsulation: ViewEncapsulation.None,
})
export class Sidebar {
  readonly menuSections = input.required<readonly MenuSectionConfig[]>();
  readonly isSmallScreen = input(false);
  readonly sidebarCollapsed = input(false);

  readonly sidebarCollapsedChange = output<boolean>();

  protected onSidebarCollapsedChange(isCollapsed: boolean): void {
    this.sidebarCollapsedChange.emit(isCollapsed);
  }

  protected onMenuItemClick(): void {
    if (this.isSmallScreen()) {
      this.sidebarCollapsedChange.emit(true);
    }
  }
}
