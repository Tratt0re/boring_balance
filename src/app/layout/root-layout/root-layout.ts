import { Component, computed, HostListener, inject, OnDestroy, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LayoutImports } from '@/shared/components/layout/layout.imports';
import { Header } from '../header/header';
import { Sidebar } from '../sidebar/sidebar';
import { Toolbar } from '../toolbar/toolbar';
import { MenuConfiguration, type MenuSectionConfig } from '@/config/menu.config';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { detectSmallScreenViewport } from '@/shared/utils';

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
export class RootLayout implements OnInit, OnDestroy {
  private readonly toolbarContextService = inject(ToolbarContextService);
  private readonly handleFullscreenChangeEvent = (payload: unknown) => {
    this.isFullscreen.set(this.resolveFullscreenState(payload));
  };

  protected readonly sidebarCollapsed = signal(false);
  protected readonly isFullscreen = signal(false);
  protected readonly isSmallScreen = signal(detectSmallScreenViewport());
  protected readonly menuSections: readonly MenuSectionConfig[] = MenuConfiguration.sections;
  protected readonly headerOffset = computed(() => (this.isFullscreen() ? '2rem' : '0rem'));
  protected readonly showSidebarOverlay = computed(() => this.isSmallScreen() && !this.sidebarCollapsed());
  protected readonly toolbarTitle = this.toolbarContextService.title;
  protected readonly toolbarItemActions = this.toolbarContextService.itemActions;
  protected readonly toolbarItemNavigation = this.toolbarContextService.itemNavigation;

  constructor() {
    if (this.isSmallScreen()) {
      this.sidebarCollapsed.set(true);
    }
  }

  ngOnInit(): void {
    this.isFullscreen.set(this.readDocumentFullscreenState());
    window.electronAPI?.onIpcEvent?.('window:fullscreenChanged', this.handleFullscreenChangeEvent);
  }

  ngOnDestroy(): void {
    window.electronAPI?.offIpcEvent?.('window:fullscreenChanged', this.handleFullscreenChangeEvent);
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
    const isSmall = detectSmallScreenViewport();
    if (isSmall === this.isSmallScreen()) {
      return;
    }

    this.isSmallScreen.set(isSmall);

    if (isSmall) {
      this.sidebarCollapsed.set(true);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscapeKeyDown(): void {
    if (this.showSidebarOverlay()) {
      this.closeSidebarOverlay();
    }
  }

  @HostListener('document:fullscreenchange')
  protected onDocumentFullscreenChange(): void {
    this.isFullscreen.set(this.readDocumentFullscreenState());
  }

  private readDocumentFullscreenState(): boolean {
    return typeof document !== 'undefined' && document.fullscreenElement !== null;
  }

  private resolveFullscreenState(payload: unknown): boolean {
    if (typeof payload === 'boolean') {
      return payload;
    }

    if (payload && typeof payload === 'object' && 'isFullscreen' in payload) {
      return payload.isFullscreen === true;
    }

    return this.readDocumentFullscreenState();
  }

}
