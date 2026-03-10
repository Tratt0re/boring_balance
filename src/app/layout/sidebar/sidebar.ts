import { Component, DestroyRef, computed, effect, inject, input, output, signal, ViewEncapsulation } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { A11yModule } from '@angular/cdk/a11y';

import { ZardIconComponent } from '@/shared/components/icon';
import {
  SidebarComponent,
  SidebarGroupComponent,
  SidebarGroupLabelComponent,
} from '@/shared/components/layout/sidebar.component';
import { ZardTooltipImports } from '@/shared/components/tooltip';
import { mergeClasses } from '@/shared/utils/merge-classes';

import type { MenuSectionConfig } from '@/config/menu.config';

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    RouterLinkActive,
    A11yModule,
    TranslatePipe,
    ZardIconComponent,
    SidebarComponent,
    SidebarGroupComponent,
    SidebarGroupLabelComponent,
    ...ZardTooltipImports,
  ],
  templateUrl: './sidebar.html',
  encapsulation: ViewEncapsulation.None,
})
export class Sidebar {
  private readonly destroyRef = inject(DestroyRef);
  private readonly collapseTransitionMs = 100;
  private collapseTransitionTimer?: ReturnType<typeof globalThis.setTimeout>;
  private previousCollapsed?: boolean;

  readonly menuSections = input.required<readonly MenuSectionConfig[]>();
  readonly isSmallScreen = input(false);
  readonly sidebarCollapsed = input(false);
  protected readonly isClosingCollapseTransition = signal(false);
  protected readonly topMenuSections = computed(() =>
    this.menuSections().filter((section) => section.placement !== 'bottom'),
  );
  protected readonly bottomMenuSections = computed(() =>
    this.menuSections().filter((section) => section.placement === 'bottom'),
  );
  protected readonly isSmallScreenCollapsed = computed(() => this.isSmallScreen() && this.sidebarCollapsed());
  protected readonly shouldTrapFocus = computed(() => this.isSmallScreen() && !this.sidebarCollapsed());

  readonly sidebarCollapsedChange = output<boolean>();

  constructor() {
    effect(() => {
      const collapsed = this.sidebarCollapsed();

      if (this.previousCollapsed === undefined) {
        this.previousCollapsed = collapsed;
        return;
      }

      if (!this.previousCollapsed && collapsed) {
        this.isClosingCollapseTransition.set(true);
        this.clearCollapseTransitionTimer();
        this.collapseTransitionTimer = globalThis.setTimeout(() => {
          this.isClosingCollapseTransition.set(false);
          this.collapseTransitionTimer = undefined;
        }, this.collapseTransitionMs);
      } else if (this.previousCollapsed && !collapsed) {
        this.isClosingCollapseTransition.set(false);
        this.clearCollapseTransitionTimer();
      }

      this.previousCollapsed = collapsed;
    });

    this.destroyRef.onDestroy(() => this.clearCollapseTransitionTimer());
  }

  protected onSidebarCollapsedChange(isCollapsed: boolean): void {
    this.sidebarCollapsedChange.emit(isCollapsed);
  }

  protected onMenuItemClick(): void {
    if (this.isSmallScreen()) {
      this.sidebarCollapsedChange.emit(true);
    }
  }

  protected navItemClasses(isActive: boolean): string {
    return mergeClasses(
      'flex h-9 items-center rounded-md px-3 text-sm transition-colors',
      this.sidebarCollapsed() ? 'justify-center' : 'justify-start gap-3',
      isActive
        ? 'bg-sidebar-primary text-sidebar-primary-foreground'
        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
    );
  }

  protected toggleSidebar(): void {
    this.sidebarCollapsedChange.emit(!this.sidebarCollapsed());
  }

  private clearCollapseTransitionTimer(): void {
    if (!this.collapseTransitionTimer) {
      return;
    }

    globalThis.clearTimeout(this.collapseTransitionTimer);
    this.collapseTransitionTimer = undefined;
  }
}
