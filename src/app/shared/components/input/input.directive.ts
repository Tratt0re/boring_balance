import { computed, Directive, effect, ElementRef, forwardRef, inject, input, linkedSignal, model } from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';

import type { ClassValue } from 'clsx';

import { NumberFormatService } from '@/services/number-format.service';
import { mergeClasses, noopFn, transform } from '@/shared/utils/merge-classes';
import { resolveNumberFormatSeparators } from '@/shared/utils/number-format';

import {
  inputVariants,
  type ZardInputSizeVariants,
  type ZardInputStatusVariants,
  type ZardInputTypeVariants,
} from './input.variants';

type OnTouchedType = () => void;
type OnChangeType = (value: string) => void;

@Directive({
  selector: 'input[z-input], textarea[z-input]',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ZardInputDirective),
      multi: true,
    },
  ],
  host: {
    '[class]': 'classes()',
    '(input)': 'updateValue($event.target)',
    '(focus)': 'onFocus()',
    '(blur)': 'onBlur()',
  },
  exportAs: 'zInput',
})
export class ZardInputDirective implements ControlValueAccessor {
  private readonly elementRef = inject(ElementRef);
  private readonly numberFormatService = inject(NumberFormatService);
  private onTouched: OnTouchedType = noopFn;
  private onChangeFn: OnChangeType = noopFn;
  private isFocused = false;

  readonly class = input<ClassValue>('');
  readonly zBorderless = input(false, { transform });
  readonly zSize = input<ZardInputSizeVariants>('default');
  readonly zStatus = input<ZardInputStatusVariants>();
  readonly value = model<string>('');

  readonly size = linkedSignal<ZardInputSizeVariants>(() => this.zSize());

  protected readonly classes = computed(() =>
    mergeClasses(
      inputVariants({
        zType: this.getType(),
        zSize: this.size(),
        zStatus: this.zStatus(),
        zBorderless: this.zBorderless(),
      }),
      this.class(),
    ),
  );

  constructor() {
    this.enableNumericModeIfNeeded();

    effect(() => {
      const value = this.value();

      if (value !== undefined && value !== null) {
        this.syncNativeValue(value);
      }
    });
  }

  disable(b: boolean): void {
    this.elementRef.nativeElement.disabled = b;
  }

  setDataSlot(name: string): void {
    if (this.elementRef?.nativeElement?.dataset) {
      this.elementRef.nativeElement.dataset.slot = name;
    }
  }

  protected updateValue(target: EventTarget | null): void {
    const el = target as HTMLInputElement | HTMLTextAreaElement | null;
    const inputValue = el?.value ?? '';

    if (!this.isNumericInput()) {
      this.value.set(inputValue);
      this.onChangeFn(this.value());
      return;
    }

    const normalizedValue = this.numberFormatService.normalizeInput(inputValue, {
      allowDecimal: this.allowsDecimalInput(),
      allowNegative: this.allowsNegativeInput(),
    });

    this.value.set(normalizedValue);
    this.syncNativeValue(normalizedValue, false);
    this.onChangeFn(this.value());
  }

  protected onFocus(): void {
    this.isFocused = true;

    if (this.isNumericInput()) {
      this.syncNativeValue(this.value(), false);
    }
  }

  protected onBlur(): void {
    this.isFocused = false;

    if (this.isNumericInput()) {
      this.syncNativeValue(this.value(), true);
    }

    this.onTouched();
  }

  getType(): ZardInputTypeVariants {
    const isTextarea = this.elementRef.nativeElement.tagName.toLowerCase() === 'textarea';
    return isTextarea ? 'textarea' : 'default';
  }

  registerOnChange(fn: OnChangeType): void {
    this.onChangeFn = fn;
  }

  registerOnTouched(fn: OnTouchedType): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disable(isDisabled);
  }

  writeValue(value?: string): void {
    const newValue = value ?? '';
    this.value.set(newValue);
    this.syncNativeValue(newValue);
  }

  private enableNumericModeIfNeeded(): void {
    if (!this.isNativeNumericInput()) {
      return;
    }

    const element = this.elementRef.nativeElement as HTMLInputElement;
    element.dataset['zNumericInput'] = 'true';
    element.type = 'text';
    element.inputMode = this.allowsDecimalInput() ? 'decimal' : 'numeric';
    element.autocomplete = 'off';
  }

  private syncNativeValue(value: string, useGrouping = !this.isFocused): void {
    const element = this.elementRef.nativeElement as HTMLInputElement | HTMLTextAreaElement;
    const nextValue = this.isNumericInput() ? this.toLocalizedNumericValue(value, useGrouping) : value;

    if (element.value !== nextValue) {
      element.value = nextValue;
    }

    if (this.isNumericInput()) {
      (element as HTMLInputElement).inputMode = this.allowsDecimalInput() ? 'decimal' : 'numeric';
    }
  }

  private isNativeNumericInput(): boolean {
    return (
      this.elementRef.nativeElement.tagName.toLowerCase() === 'input'
      && this.elementRef.nativeElement.getAttribute('type') === 'number'
    );
  }

  private isNumericInput(): boolean {
    return this.elementRef.nativeElement.dataset?.['zNumericInput'] === 'true';
  }

  private allowsDecimalInput(): boolean {
    const stepValue = this.elementRef.nativeElement.getAttribute('step');
    if (!stepValue || stepValue === 'any') {
      return true;
    }

    const parsedStep = Number(stepValue);
    return !Number.isFinite(parsedStep) || !Number.isInteger(parsedStep);
  }

  private allowsNegativeInput(): boolean {
    const minValue = this.elementRef.nativeElement.getAttribute('min');
    if (!minValue) {
      return true;
    }

    const parsedMin = Number(minValue);
    return !Number.isFinite(parsedMin) || parsedMin < 0;
  }

  private toLocalizedNumericValue(value: string, useGrouping: boolean): string {
    const normalizedValue = `${value ?? ''}`;
    if (!/^-?\d+(\.\d*)?$/.test(normalizedValue)) {
      return normalizedValue;
    }

    const separators = resolveNumberFormatSeparators(this.numberFormatService.currencyFormatStyle());
    const isNegative = normalizedValue.startsWith('-');
    const unsignedValue = isNegative ? normalizedValue.slice(1) : normalizedValue;
    const [integerPart, fractionPart] = unsignedValue.split('.');
    const groupedIntegerPart = useGrouping
      ? integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, separators.thousands)
      : integerPart;
    const signPrefix = isNegative ? '-' : '';

    if (fractionPart === undefined) {
      return `${signPrefix}${groupedIntegerPart}`;
    }

    return `${signPrefix}${groupedIntegerPart}${separators.decimal}${fractionPart}`;
  }
}
