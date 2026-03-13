import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

import { APP_CONFIG } from '../../config';

@Component({
  selector: 'app-page-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <footer class="mx-auto w-full max-w-6xl border-t border-border px-6 py-8 sm:px-10">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div class="text-sm text-muted-foreground">
          <p>&copy; Boring Balance</p>
          <p class="mt-2 max-w-2xl leading-6">
            Open source desktop personal finance, kept local and kept simple.
          </p>
        </div>

        <nav aria-label="Footer links" class="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <a
            [href]="releaseUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Download on GitHub
          </a>
          <a
            [href]="repoUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Browse the source
          </a>
        </nav>
      </div>
    </footer>
  `,
})
export class PageFooterComponent {
  protected readonly releaseUrl = APP_CONFIG.releaseUrl;
  protected readonly repoUrl = APP_CONFIG.repoUrl;
}
