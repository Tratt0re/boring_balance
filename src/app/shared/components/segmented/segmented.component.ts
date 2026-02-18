import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  ElementRef,
  effect,
  forwardRef,
  HostListener,
  input,
  type OnInit,
  output,
  signal,
  viewChildren,
  ViewEncapsulation,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import type { ClassValue } from 'clsx';

import { segmentedItemVariants, segmentedVariants, type ZardSegmentedVariants } from './segmented.variants';

import { mergeClasses } from '@/shared/utils/merge-classes';

export interface SegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SegmentedActiveIndicatorState {
  readonly width: string;
  readonly transform: string;
  readonly visible: boolean;
}
@Component({
  selector: 'z-segmented-item',
  standalone: true,
  template: `
    <ng-content />
  `,
  encapsulation: ViewEncapsulation.None,
})
export class ZardSegmentedItemComponent {
  readonly value = input.required<string>();
  readonly label = input.required<string>();
  readonly disabled = input(false);
}

@Component({
  selector: 'z-segmented',
  standalone: true,
  template: `
    <div [class]="classes()" role="tablist" [attr.aria-label]="zAriaLabel()">
      <span
        class="pointer-events-none absolute top-1 bottom-1 left-0 rounded-sm bg-background shadow-sm transition-[transform,width,opacity] duration-200 ease-out"
        [style.width]="activeIndicatorState().width"
        [style.transform]="activeIndicatorState().transform"
        [class.opacity-0]="!activeIndicatorState().visible"
      ></span>

      @for (option of resolvedOptions(); track option.value) {
        <button
          #segmentButton
          type="button"
          role="tab"
          [class]="getItemClasses(option.value)"
          [disabled]="option.disabled || zDisabled()"
          [attr.aria-selected]="isSelected(option.value)"
          [attr.aria-controls]="option.value + '-panel'"
          [attr.id]="option.value + '-tab'"
          (click)="selectOption(option.value)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ZardSegmentedComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'wrapperClasses()',
  },
  exportAs: 'zSegmented',
})
export class ZardSegmentedComponent implements ControlValueAccessor, OnInit {
  private readonly itemComponents = contentChildren(ZardSegmentedItemComponent);
  private readonly segmentButtons = viewChildren<ElementRef<HTMLButtonElement>>('segmentButton');
  private readonly layoutVersion = signal(0);

  readonly class = input<ClassValue>('');
  readonly zSize = input<ZardSegmentedVariants['zSize']>('default');
  readonly zOptions = input<SegmentedOption[]>([]);
  readonly zDefaultValue = input<string>('');
  readonly zDisabled = input(false);
  readonly zAriaLabel = input<string>('Segmented control');

  readonly zChange = output<string>();

  protected readonly selectedValue = signal<string>('');
  protected readonly items = signal<readonly ZardSegmentedItemComponent[]>([]);
  protected readonly resolvedOptions = computed<readonly SegmentedOption[]>(() => {
    const options = this.zOptions();
    if (options.length > 0) {
      return options;
    }

    return this.items().map((item) => ({
      value: item.value(),
      label: item.label(),
      disabled: item.disabled(),
    }));
  });
  protected readonly selectedIndex = computed(() =>
    this.resolvedOptions().findIndex((option) => option.value === this.selectedValue()),
  );
  protected readonly activeIndicatorState = computed<SegmentedActiveIndicatorState>(() => {
    this.layoutVersion();

    const selectedIndex = this.selectedIndex();
    const button = this.segmentButtons()[selectedIndex]?.nativeElement;

    if (!button) {
      return { width: '0px', transform: 'translateX(0px)', visible: false };
    }

    return {
      width: `${button.offsetWidth}px`,
      transform: `translateX(${button.offsetLeft}px)`,
      visible: true,
    };
  });

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onChange: (value: string) => void = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onTouched = () => {};

  constructor() {
    effect(() => {
      this.items.set(this.itemComponents());
    });
  }

  ngOnInit() {
    // Initialize with default value
    if (this.zDefaultValue()) {
      this.selectedValue.set(this.zDefaultValue());
    }
  }

  protected readonly classes = computed(() => mergeClasses(segmentedVariants({ zSize: this.zSize() }), this.class()));

  protected readonly wrapperClasses = computed(() => 'inline-block');

  protected getItemClasses(value: string): string {
    return segmentedItemVariants({
      zSize: this.zSize(),
      isActive: this.isSelected(value),
    });
  }

  protected isSelected(value: string): boolean {
    return this.selectedValue() === value;
  }

  protected selectOption(value: string) {
    if (this.zDisabled()) return;

    const option = this.resolvedOptions().find((resolvedOption) => resolvedOption.value === value);
    if (!option || option.disabled) return;

    this.selectedValue.set(value);
    this.onChange(value);
    this.onTouched();
    this.zChange.emit(value);
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.layoutVersion.update((current) => current + 1);
  }

  // ControlValueAccessor implementation
  writeValue(value: string): void {
    this.selectedValue.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(_isDisabled: boolean): void {
    // Handled by zDisabled input
  }
}
