import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { ClassValue } from 'clsx';

import { mergeClasses } from '@/shared/utils/merge-classes';

const DEFAULT_BRAND_ICON_PATH = 'assetts/icon/bb_ico_full.svg';

@Component({
  selector: 'app-brand-icon',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'img',
    '[class]': 'classes()',
    '[style.width]': 'width()',
    '[style.background-color]': 'color()',
    '[style.--app-brand-icon-mask]': 'maskUrl()',
    '[attr.aria-label]': 'ariaLabel()',
  },
  styles: `
    :host {
      display: block;
      max-width: 100%;
      aspect-ratio: 342 / 160;
      -webkit-mask: var(--app-brand-icon-mask) center / contain no-repeat;
      mask: var(--app-brand-icon-mask) center / contain no-repeat;
    }
  `,
})
export class AppBrandIconComponent {
  readonly class = input<ClassValue>('');
  readonly width = input('13rem');
  readonly color = input('var(--sidebar-primary)');
  readonly ariaLabel = input('Boring Balance logo');
  readonly src = input(DEFAULT_BRAND_ICON_PATH);

  protected readonly classes = computed(() => mergeClasses('shrink-0', this.class()));
  protected readonly maskUrl = computed(() => `url(${this.resolveAssetUrl(this.src())})`);

  private resolveAssetUrl(value: string): string {
    const source = value.trim();
    if (source.length === 0) {
      return DEFAULT_BRAND_ICON_PATH;
    }

    if (/^(?:https?:|file:|data:|blob:|\/)/.test(source)) {
      return source;
    }

    if (typeof document === 'undefined') {
      return source;
    }

    try {
      return new URL(source, document.baseURI).toString();
    } catch {
      return source;
    }
  }
}
