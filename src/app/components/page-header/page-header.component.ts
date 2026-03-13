import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';
import { LucideAngularModule, Github, Sun, Moon, Monitor } from 'lucide-angular';

import { LogoComponent } from '../logo/logo.component';
import { ThemeMode, ThemeService } from '../../services/theme.service';
import { APP_CONFIG } from '../../config';

@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [LogoComponent, LucideAngularModule],
  template: `
    <header class="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5 sm:px-10">
      <a href="/" aria-label="Boring Balance — go to homepage">
        <app-logo class="h-7 w-auto text-primary" />
      </a>

      <nav aria-label="Site navigation">
        <div class="flex items-center gap-2">
          <!-- GitHub link -->
          <a
            [href]="repoUrl"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on GitHub"
            class="flex size-9 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <lucide-icon [img]="githubIcon" [size]="16" aria-hidden="true" />
          </a>

          <!-- Theme toggle -->
          <button
            type="button"
            (click)="cycleTheme($event)"
            [attr.aria-label]="themeAriaLabel()"
            [attr.title]="themeTitle()"
            class="flex size-9 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    if (t === 'light') return 'Light mode';
    if (t === 'dark') return 'Dark mode';
    return 'System preference';
  }

  protected cycleTheme(event: MouseEvent): void {
    this.theme.cycleTheme(event);
  }
}
