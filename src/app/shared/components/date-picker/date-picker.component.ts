import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
  model,
  output,
  viewChild,
  ViewEncapsulation,
  type TemplateRef,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { map, startWith } from 'rxjs';

import type { ClassValue } from 'clsx';

import { ZardButtonComponent } from '@/shared/components/button/button.component';
import type { ZardButtonSizeVariants, ZardButtonTypeVariants } from '@/shared/components/button/button.variants';
import { ZardCalendarComponent } from '@/shared/components/calendar/calendar.component';
import { ZardIconComponent } from '@/shared/components/icon/icon.component';
import { ZardPopoverComponent, ZardPopoverDirective } from '@/shared/components/popover/popover.component';
import type { ZardPopoverPlacement } from '@/shared/components/popover/popover.component';

import { mergeClasses, transform } from '@/shared/utils/merge-classes';

const HEIGHT_BY_SIZE: Record<NonNullable<ZardButtonSizeVariants>, string> = {
  sm: 'h-8',
  default: 'h-10',
  lg: 'h-12',
};

@Component({
  selector: 'z-date-picker, [z-date-picker]',
  imports: [ZardButtonComponent, ZardCalendarComponent, ZardPopoverComponent, ZardPopoverDirective, ZardIconComponent],
  standalone: true,
  template: `
    <button
      z-button
      type="button"
      [zType]="zType()"
      [zSize]="zSize()"
      [zDisabled]="disabled()"
      [disabled]="disabled()"
      [class]="buttonClasses()"
      zPopover
      #popoverDirective="zPopover"
      [zContent]="calendarTemplate"
      zTrigger="click"
      [zPlacement]="zPopoverPlacement()"
      [zAutoFlip]="zPopoverAutoFlip()"
      [zPush]="zPopoverPush()"
      [zViewportMargin]="zPopoverViewportMargin()"
      (zVisibleChange)="onPopoverVisibilityChange($event)"
      [attr.aria-expanded]="false"
      [attr.aria-haspopup]="true"
      [attr.aria-label]="chooseDateAriaLabel()"
    >
      @if (zIconPosition() === 'left') {
        <z-icon zType="calendar" [class]="zCalendarIconClass()" />
      }
      <span [class]="textClasses()">
        {{ displayText() }}
      </span>
      @if (zIconPosition() === 'right') {
        <z-icon zType="calendar" [class]="zCalendarIconClass()" />
      }
    </button>

    <ng-template #calendarTemplate>
      <z-popover [class]="popoverClasses()">
        <z-calendar
          #calendar
          class="border-0"
          [value]="value()"
          [minDate]="minDate()"
          [maxDate]="maxDate()"
          [disabled]="disabled()"
          (dateChange)="onDateChange($event)"
        />
      </z-popover>
    </ng-template>
  `,
  providers: [
    DatePipe,
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ZardDatePickerComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'class()',
  },
  exportAs: 'zDatePicker',
})
export class ZardDatePickerComponent implements ControlValueAccessor {
  private readonly datePipe = inject(DatePipe);
  private readonly translateService = inject(TranslateService);
  private readonly currentLocale = toSignal(
    this.translateService.onLangChange.pipe(
      map((event) => event.lang),
      startWith(this.translateService.currentLang ?? this.translateService.getCurrentLang() ?? 'en'),
    ),
    { initialValue: this.translateService.currentLang ?? this.translateService.getCurrentLang() ?? 'en' },
  );

  readonly calendarTemplate = viewChild.required<TemplateRef<unknown>>('calendarTemplate');
  readonly popoverDirective = viewChild.required<ZardPopoverDirective>('popoverDirective');
  readonly calendar = viewChild.required<ZardCalendarComponent>('calendar');

  readonly class = input<ClassValue>('');
  readonly zType = input<ZardButtonTypeVariants>('outline');
  readonly zSize = input<ZardButtonSizeVariants>('default');
  readonly zIconPosition = input<'left' | 'right'>('left');
  readonly zBorderless = input(false, { transform });
  readonly zPaddingless = input(false, { transform });
  readonly zCalendarIconClass = input<ClassValue>('');
  readonly zPopoverPlacement = input<ZardPopoverPlacement>('bottom');
  readonly zPopoverAutoFlip = input(true, { transform });
  readonly zPopoverPush = input(false, { transform });
  readonly zPopoverViewportMargin = input(8);
  readonly value = model<Date | null>(null);
  readonly placeholder = input<string>('Pick a date');
  readonly zFormat = input<string>('MMMM d, yyyy');
  readonly minDate = input<Date | null>(null);
  readonly maxDate = input<Date | null>(null);
  readonly disabled = model<boolean>(false);

  readonly dateChange = output<Date | null>();

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onChange: (value: Date | null) => void = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onTouched: () => void = () => {};

  protected readonly buttonClasses = computed(() => {
    const hasValue = !!this.value();
    const size = this.zSize();
    const height = HEIGHT_BY_SIZE[size];
    return mergeClasses(
      'text-left font-normal',
      this.zIconPosition() === 'right' ? 'justify-between' : 'justify-start',
      this.zBorderless()
        ? 'border-0 bg-transparent shadow-none hover:bg-transparent focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent'
        : '',
      this.zPaddingless() ? 'px-0 py-0' : '',
      !hasValue && 'text-muted-foreground',
      height,
      'w-full min-w-0',
    );
  });

  protected readonly textClasses = computed(() => {
    const hasValue = !!this.value();
    return mergeClasses(!hasValue && 'text-muted-foreground');
  });

  protected readonly popoverClasses = computed(() => mergeClasses('w-auto p-0'));
  protected readonly chooseDateAriaLabel = computed(() =>
    this.translateService.instant('common.calendar.aria.chooseDate'),
  );

  protected readonly displayText = computed(() => {
    const locale = this.currentLocale();
    const date = this.value();
    if (!date) {
      return this.placeholder();
    }
    return this.formatDate(date, this.zFormat(), locale);
  });

  protected onDateChange(date: Date | Date[]): void {
    // Date picker always uses single mode, so we can safely cast
    const singleDate = Array.isArray(date) ? (date[0] ?? null) : date;
    this.value.set(singleDate);
    this.onChange(singleDate);
    this.onTouched();
    this.dateChange.emit(singleDate);

    this.popoverDirective().hide();
  }

  protected onPopoverVisibilityChange(visible: boolean): void {
    if (visible) {
      setTimeout(() => {
        if (this.calendar()) {
          this.calendar().resetNavigation();
        }
      });
    }
  }

  private formatDate(date: Date, format: string, locale?: string): string {
    return this.datePipe.transform(date, format, undefined, locale) ?? '';
  }

  writeValue(value: Date | null): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: Date | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
