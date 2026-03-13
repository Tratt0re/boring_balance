import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';
import { LucideAngularModule, Github, Sun, Moon, Monitor } from 'lucide-angular';

import { BrandIconComponent } from '../brand-icon/brand-icon.component';
import { ThemeService } from '../../services/theme.service';
import { APP_CONFIG } from '../../config';

@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [BrandIconComponent, LucideAngularModule],
  template: `
    <header class="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5 sm:px-10">
      <a
        [href]="homePath"
        aria-label="Boring Balance home"
        class="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <app-brand-icon class="h-8 w-auto text-primary" />
      </a>

      <nav aria-label="Site navigation">
        <div class="flex items-center gap-2.5">
          <a
            [href]="repoUrl"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Browse the Boring Balance GitHub repository"
            class="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <lucide-icon [img]="githubIcon" [size]="16" aria-hidden="true" />
          </a>

          <button
            type="button"
            (click)="cycleTheme($event)"
            [attr.aria-label]="themeAriaLabel()"
            [attr.title]="themeTitle()"
            class="flex size-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <lucide-icon [img]="themeIcon()" [size]="16" aria-hidden="true" />
          </button>
        </div>
      </nav>
    </header>
  `,
})
export class PageHeaderComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly homePath = APP_CONFIG.homePath;
  protected readonly repoUrl = APP_CONFIG.repoUrl;

  protected readonly githubIcon = Github;
  protected readonly sunIcon = Sun;
  protected readonly moonIcon = Moon;
  protected readonly monitorIcon = Monitor;

  protected themeIcon() {
    const t = this.theme.theme();
    if (t === 'system') return this.monitorIcon;
    return t === 'light' ? this.sunIcon : this.moonIcon;
  }

  protected themeAriaLabel(): string {
    const t = this.theme.theme();
    if (t === 'light') return 'Switch to dark mode';
    if (t === 'dark') return 'Switch to system preference';
    return 'Switch to light mode';
  }

  protected themeTitle(): string {
    const t = this.theme.theme();
    if (t === 'light') return 'Theme: light';
    if (t === 'dark') return 'Theme: dark';
    return 'Theme: system';
  }

  protected cycleTheme(event: MouseEvent): void {
    this.theme.cycleTheme(event);
  }
}
