import { toSignal } from '@angular/core/rxjs-interop';
import { Component, computed, inject, input, output, ViewEncapsulation } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';

import { filter, map, startWith } from 'rxjs';

import { SidebarToggleComponent } from '@/components/sidebar-toggle/sidebar-toggle.component';
import { ZardIconComponent } from '@/shared/components/icon';
import { HeaderComponent } from '@/shared/components/layout/header.component';
import { MenuConfiguration } from '@/config/menu.config';

interface BreadcrumbItem {
  readonly label: string;
  readonly path?: string;
}

@Component({
  selector: 'app-breadcrumb',
  imports: [HeaderComponent, RouterLink, SidebarToggleComponent, ZardIconComponent, TranslatePipe],
  templateUrl: './breadcrumb.html',
  encapsulation: ViewEncapsulation.None,
})
export class Breadcrumb {
  readonly sidebarCollapsed = input(false);
  readonly isSmallScreen = input(false);
  readonly sidebarToggle = output<void>();

  private readonly router = inject(Router);
  private readonly routeLabelMap = new Map(
    MenuConfiguration.sections.flatMap((section) => section.items.map((item) => [item.path, item.label] as const)),
  );

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly items = computed(() => this.buildBreadcrumbs(this.currentUrl()));

  protected toggleSidebar(): void {
    this.sidebarToggle.emit();
  }

  private buildBreadcrumbs(url: string): readonly BreadcrumbItem[] {
    const normalizedPath = this.normalizePath(url);

    if (normalizedPath === '/') {
      return [{ label: this.routeLabelMap.get('/') ?? 'nav.items.overview' }];
    }

    const segments = normalizedPath.split('/').filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [];

    let currentPath = '';
    for (const segment of segments) {
      currentPath += `/${segment}`;
      breadcrumbs.push({
        label: this.resolveLabel(currentPath, segment),
        path: currentPath,
      });
    }

    const last = breadcrumbs[breadcrumbs.length - 1];
    breadcrumbs[breadcrumbs.length - 1] = { label: last.label };

    return breadcrumbs;
  }

  private normalizePath(url: string): string {
    const pathOnly = url.split('?')[0]?.split('#')[0] ?? '/';

    if (!pathOnly || pathOnly === '/') {
      return '/';
    }

    return pathOnly.endsWith('/') ? pathOnly.slice(0, -1) : pathOnly;
  }

  private resolveLabel(path: string, segment: string): string {
    const directLabel = this.routeLabelMap.get(path);
    if (directLabel) {
      return directLabel;
    }

    const sectionLabel = MenuConfiguration.sections.find((section) =>
      section.items.some((item) => item.path.startsWith(`${path}/`)),
    )?.label;
    if (sectionLabel) {
      return sectionLabel;
    }

    return this.toTitleCase(segment);
  }

  private toTitleCase(segment: string): string {
    return segment
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
