import { NgTemplateOutlet } from '@angular/common';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  TemplateRef,
  ViewEncapsulation,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { ClassValue } from 'clsx';

import {
  ZardButtonComponent,
  type ZardButtonSizeVariants,
  type ZardButtonTypeVariants,
} from '@/shared/components/button';
import { ZardIconComponent } from '@/shared/components/icon';
import { ZardTooltipImports } from '@/shared/components/tooltip';
import {
  paginationContentVariants,
  paginationEllipsisVariants,
  paginationNextVariants,
  paginationPreviousVariants,
  paginationVariants,
} from '@/shared/components/pagination/pagination.variants';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'ul[z-pagination-content]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'pagination-content',
    '[class]': 'classes()',
  },
  exportAs: 'zPaginationContent',
})
export class ZardPaginationContentComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(paginationContentVariants(), this.class()));
}

@Component({
  selector: 'li[z-pagination-item]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'pagination-item',
  },
  exportAs: 'zPaginationItem',
})
export class ZardPaginationItemComponent {}
// Structural wrapper component for pagination items (<li>). No inputs required.

@Component({
  selector: 'button[z-pagination-button], a[z-pagination-button]',
  imports: [ZardButtonComponent],
  template: `
    <z-button
      [attr.data-active]="zActive() || null"
      [class]="class()"
      [zDisabled]="zDisabled()"
      [zSize]="zSize()"
      [zType]="zButtonType()"
    >
      <ng-content />
    </z-button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'pagination-button',
  },
  exportAs: 'zPaginationButton',
})
export class ZardPaginationButtonComponent {
  readonly class = input<ClassValue>('');
  readonly zActive = input(false, { transform: booleanAttribute });
  readonly zDisabled = input(false, { transform: booleanAttribute });
  readonly zSize = input<ZardButtonSizeVariants>('default');
  readonly zType = input<ZardButtonTypeVariants | null>(null);

  protected readonly zButtonType = computed<ZardButtonTypeVariants>(() =>
    this.zType() ?? (this.zActive() ? 'outline' : 'ghost'),
  );
}

@Component({
  selector: 'z-pagination-previous',
  imports: [TranslatePipe, ZardPaginationButtonComponent, ZardIconComponent, ...ZardTooltipImports],
  template: `
    <button
      type="button"
      z-pagination-button
      [attr.aria-label]="'common.pagination.tooltips.previousPage' | translate"
      [attr.disabled]="zDisabled() ? '' : null"
      [zTooltip]="'common.pagination.tooltips.previousPage' | translate"
      [zType]="'secondary'"
      [class]="classes()"
      [zSize]="zSize()"
      [zDisabled]="zDisabled()"
    >
      <z-icon zType="chevron-left" aria-hidden="true" />
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'zPaginationPrevious',
})
export class ZardPaginationPreviousComponent {
  readonly class = input<ClassValue>('');
  readonly zDisabled = input(false, { transform: booleanAttribute });
  readonly zSize = input<ZardButtonSizeVariants>('default');

  protected readonly classes = computed(() => mergeClasses(paginationPreviousVariants(), this.class()));
}

@Component({
  selector: 'z-pagination-next',
  imports: [TranslatePipe, ZardPaginationButtonComponent, ZardIconComponent, ...ZardTooltipImports],
  template: `
    <button
      type="button"
      z-pagination-button
      [attr.aria-label]="'common.pagination.tooltips.nextPage' | translate"
      [attr.disabled]="zDisabled() ? '' : null"
      [zTooltip]="'common.pagination.tooltips.nextPage' | translate"
      [zType]="'secondary'"
      [class]="classes()"
      [zDisabled]="zDisabled()"
      [zSize]="zSize()"
    >
      <z-icon zType="chevron-right" aria-hidden="true" />
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'zPaginationNext',
})
export class ZardPaginationNextComponent {
  readonly class = input<ClassValue>('');
  readonly zDisabled = input(false, { transform: booleanAttribute });
  readonly zSize = input<ZardButtonSizeVariants>('default');

  protected readonly classes = computed(() => mergeClasses(paginationNextVariants(), this.class()));
}

@Component({
  selector: 'z-pagination-first',
  imports: [TranslatePipe, ZardPaginationButtonComponent, ZardIconComponent, ...ZardTooltipImports],
  template: `
    <button
      type="button"
      z-pagination-button
      [attr.aria-label]="'common.pagination.tooltips.firstPage' | translate"
      [attr.disabled]="zDisabled() ? '' : null"
      [zTooltip]="'common.pagination.tooltips.firstPage' | translate"
      [zType]="'secondary'"
      [class]="classes()"
      [zDisabled]="zDisabled()"
      [zSize]="zSize()"
    >
      <z-icon zType="chevrons-left" aria-hidden="true" />
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'zPaginationFirst',
})
export class ZardPaginationFirstComponent {
  readonly class = input<ClassValue>('');
  readonly zDisabled = input(false, { transform: booleanAttribute });
  readonly zSize = input<ZardButtonSizeVariants>('default');

  protected readonly classes = computed(() => mergeClasses('size-9 p-0', this.class()));
}

@Component({
  selector: 'z-pagination-last',
  imports: [TranslatePipe, ZardPaginationButtonComponent, ZardIconComponent, ...ZardTooltipImports],
  template: `
    <button
      type="button"
      z-pagination-button
      [attr.aria-label]="'common.pagination.tooltips.lastPage' | translate"
      [attr.disabled]="zDisabled() ? '' : null"
      [zTooltip]="'common.pagination.tooltips.lastPage' | translate"
      [zType]="'secondary'"
      [class]="classes()"
      [zDisabled]="zDisabled()"
      [zSize]="zSize()"
    >
      <z-icon zType="chevrons-right" aria-hidden="true" />
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'zPaginationLast',
})
export class ZardPaginationLastComponent {
  readonly class = input<ClassValue>('');
  readonly zDisabled = input(false, { transform: booleanAttribute });
  readonly zSize = input<ZardButtonSizeVariants>('default');

  protected readonly classes = computed(() => mergeClasses('size-9 p-0', this.class()));
}

@Component({
  selector: 'z-pagination-ellipsis',
  imports: [ZardIconComponent],
  template: `
    <z-icon zType="ellipsis" aria-hidden="true" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    'aria-hidden': 'true',
  },
  exportAs: 'zPaginationEllipsis',
})
export class ZardPaginationEllipsisComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(paginationEllipsisVariants(), this.class()));
}

@Component({
  selector: 'z-pagination',
  imports: [
    TranslatePipe,
    ZardPaginationContentComponent,
    ZardPaginationItemComponent,
    ZardPaginationButtonComponent,
    ZardPaginationFirstComponent,
    ZardPaginationPreviousComponent,
    ZardPaginationNextComponent,
    ZardPaginationLastComponent,
    NgTemplateOutlet,
  ],
  template: `
    @if (zContent()) {
      <ng-container *ngTemplateOutlet="zContent()" />
    } @else {
      <ul z-pagination-content>
        <li z-pagination-item>
          <z-pagination-first
            [zSize]="zSize()"
            [zDisabled]="zDisabled() || zPageIndex() === 1"
            (click)="goToPage(1)"
          />
        </li>

        <li z-pagination-item>
          @let pagePrevious = Math.max(1, zPageIndex() - 1);
          <z-pagination-previous
            [zSize]="zSize()"
            [zDisabled]="zDisabled() || zPageIndex() === 1"
            (click)="goToPage(pagePrevious)"
          />
        </li>

        @for (page of pages(); track page) {
          <li z-pagination-item>
            <button
              z-pagination-button
              type="button"
              class="focus-visible:rounded-md"
              [attr.aria-current]="page === zPageIndex() ? 'page' : null"
              [attr.aria-disabled]="zDisabled() || null"
              [zActive]="page === zPageIndex()"
              [zDisabled]="zDisabled()"
              [zSize]="zSize()"
              (click)="goToPage(page)"
            >
              <span class="sr-only">
                {{
                  page === zTotal()
                    ? ('common.pagination.tooltips.toLastPage' | translate)
                    : ('common.pagination.tooltips.toPage' | translate)
                }}
              </span>
              {{ page }}
            </button>
          </li>
        }

        <li z-pagination-item>
          @let pageNext = Math.min(zPageIndex() + 1, zTotal());
          <z-pagination-next
            [zSize]="zSize()"
            [zDisabled]="zDisabled() || zPageIndex() === zTotal()"
            (click)="goToPage(pageNext)"
          />
        </li>

        <li z-pagination-item>
          <z-pagination-last
            [zSize]="zSize()"
            [zDisabled]="zDisabled() || zPageIndex() === zTotal()"
            (click)="goToPage(zTotal())"
          />
        </li>
      </ul>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    role: 'group',
    '[attr.aria-label]': 'zAriaLabel()',
    'data-slot': 'pagination',
    '[class]': 'classes()',
  },
  exportAs: 'zPagination',
})
export class ZardPaginationComponent {
  readonly zPageIndex = model<number>(1);
  readonly zTotal = input<number>(1);
  readonly zVisiblePages = input<number>(5);
  readonly zSize = input<ZardButtonSizeVariants>('default');
  readonly zDisabled = input(false, { transform: booleanAttribute });
  readonly zContent = input<TemplateRef<void> | undefined>();
  readonly zAriaLabel = input('Pagination');

  readonly class = input<ClassValue>('');

  readonly zPageIndexChange = output<number>();
  readonly Math = Math;

  protected readonly classes = computed(() => mergeClasses(paginationVariants(), this.class()));
  readonly pages = computed<number[]>(() => {
    const total = Math.max(1, Math.trunc(this.zTotal()));
    const visiblePages = Math.max(1, Math.trunc(this.zVisiblePages()));
    const current = this.clampPage(this.zPageIndex());

    if (total <= visiblePages) {
      return Array.from({ length: total }, (_, index) => index + 1);
    }

    const halfWindow = Math.floor(visiblePages / 2);
    let start = Math.max(1, current - halfWindow);
    let end = start + visiblePages - 1;

    if (end > total) {
      end = total;
      start = Math.max(1, end - visiblePages + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });

  private clampPage(page: number): number {
    const total = Math.max(1, Math.trunc(this.zTotal()));
    const normalizedPage = Math.trunc(page);
    if (!Number.isFinite(normalizedPage)) {
      return 1;
    }

    return Math.min(Math.max(1, normalizedPage), total);
  }

  goToPage(page: number): void {
    const nextPage = this.clampPage(page);
    if (!this.zDisabled() && nextPage !== this.zPageIndex()) {
      this.zPageIndex.set(nextPage);
      this.zPageIndexChange.emit(nextPage);
    }
  }
}
