import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  type TemplateRef,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import {
  baseCardBodyVariants,
  baseCardFooterVariants,
  baseCardHeaderVariants,
  baseCardVariants,
} from './base-card.variants';
import { ZardIdDirective, ZardStringTemplateOutletDirective } from '@/shared/core';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'app-base-card',
  imports: [ZardStringTemplateOutletDirective, ZardIdDirective],
  templateUrl: './base-card.component.html',
  styles: `
    [data-slot='card-footer']:empty {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'card',
    '[class]': 'classes()',
    '[attr.aria-labelledby]': 'titleId()',
    '[attr.aria-describedby]': 'descriptionId()',
  },
  exportAs: 'appBaseCard',
})
export class AppBaseCardComponent {
  private readonly generatedId = viewChild<ZardIdDirective>('z');

  readonly class = input<ClassValue>('');
  readonly zFooterBorder = input(false, { transform: booleanAttribute });
  readonly zHeaderBorder = input(false, { transform: booleanAttribute });
  readonly zBodyFill = input(false, { transform: booleanAttribute });
  readonly zDescription = input<string | TemplateRef<void>>();
  readonly zTitle = input<string | TemplateRef<void>>();

  protected readonly titleId = computed(() => {
    const baseId = this.generatedId()?.id();
    return this.zTitle() && baseId ? `${baseId}-title` : null;
  });

  protected readonly descriptionId = computed(() => {
    const baseId = this.generatedId()?.id();
    return this.zDescription() && baseId ? `${baseId}-description` : null;
  });

  protected readonly classes = computed(() => mergeClasses(baseCardVariants(), this.class()));
  protected readonly bodyClasses = computed(() =>
    mergeClasses(baseCardBodyVariants(), this.zBodyFill() ? 'flex-1 min-h-0' : ''),
  );
  protected readonly footerClasses = computed(() =>
    mergeClasses(baseCardFooterVariants(), this.zFooterBorder() ? 'border-t' : ''),
  );
  protected readonly headerClasses = computed(() =>
    mergeClasses(baseCardHeaderVariants(), this.zHeaderBorder() ? 'border-b' : ''),
  );
}
