import { Component, computed, HostListener, inject, signal, ViewEncapsulation } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LayoutImports } from '@/shared/components/layout/layout.imports';
import { Header } from '../header/header';
import { Sidebar } from '../sidebar/sidebar';
import { Toolbar } from '../toolbar/toolbar';
import { MenuConfiguration, type MenuSectionConfig } from '@/config/menu.config';
import { ToolbarContextService } from '@/services/toolbar-context.service';

@Component({
  selector: 'app-root-layout',
  imports: [
    ...LayoutImports,
    TranslatePipe,
    Header,
    Toolbar,
    Sidebar,
  ],
  templateUrl: './root-layout.html',
  encapsulation: ViewEncapsulation.None,
})
export class RootLayout {
  private readonly toolbarContextService = inject(ToolbarContextService);

  protected readonly sidebarCollapsed = signal(false);
  protected readonly isSmallScreen = signal(this.detectSmallScreen());
  protected readonly menuSections: readonly MenuSectionConfig[] = MenuConfiguration.sections;
  protected readonly showSidebarOverlay = computed(() => this.isSmallScreen() && !this.sidebarCollapsed());
  protected readonly toolbarTitle = this.toolbarContextService.title;
  protected readonly toolbarActions = this.toolbarContextService.actions;

  constructor() {
    if (this.isSmallScreen()) {
      this.sidebarCollapsed.set(true);
    }
  }

  protected setSidebarCollapsed(isCollapsed: boolean): void {
    this.sidebarCollapsed.set(isCollapsed);
  }

  protected toggleSidebar(): void {
    this.sidebarCollapsed.update((isCollapsed) => !isCollapsed);
  }

  protected closeSidebarOverlay(): void {
    this.sidebarCollapsed.set(true);
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    const isSmall = this.detectSmallScreen();
    if (isSmall === this.isSmallScreen()) {
      return;
    }

    this.isSmallScreen.set(isSmall);

    if (isSmall) {
      this.sidebarCollapsed.set(true);
    }
  }

  private detectSmallScreen(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.innerWidth < 768;
  }
}
