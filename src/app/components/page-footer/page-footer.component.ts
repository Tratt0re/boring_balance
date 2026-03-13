import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

import { APP_CONFIG } from '../../config';

@Component({
  selector: 'app-page-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <footer class="mx-auto w-full max-w-6xl border-t border-border px-6 py-6 sm:px-10">
      <div class="flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
        <p>&copy; Boring Balance &middot; A simple tool for simple finances.</p>
        <a
          [href]="repoUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          GitHub
        </a>
      </div>
    </footer>
  `,
})
export class PageFooterComponent {
  protected readonly repoUrl = APP_CONFIG.repoUrl;
}
