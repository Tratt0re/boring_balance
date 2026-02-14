import { Component, computed, HostListener, signal, ViewEncapsulation } from '@angular/core';
import { LayoutImports } from '@/shared/components/layout/layout.imports';

import { Breadcrumb } from '../breadcrumb/breadcrumb';
import { Footer } from '../footer/footer';
import { Header } from '../header/header';
import { Sidebar } from '../sidebar/sidebar';
import { MenuConfiguration, type MenuSectionConfig } from '@/config/menu.config';

@Component({
  selector: 'app-root-layout',
  imports: [
    ...LayoutImports,
    Header,
    Breadcrumb,
    Sidebar,
    Footer,
  ],
  templateUrl: './root-layout.html',
  encapsulation: ViewEncapsulation.None,
})
export class RootLayout {
  protected readonly sidebarCollapsed = signal(false);
  protected readonly isSmallScreen = signal(this.detectSmallScreen());
  protected readonly menuSections: readonly MenuSectionConfig[] = MenuConfiguration.sections;
  protected readonly showSidebarOverlay = computed(() => this.isSmallScreen() && !this.sidebarCollapsed());

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
