import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  Injector,
  input,
  output,
  runInInjectionContext,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { type ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

import type { ClassValue } from 'clsx';

import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent, type ZardButtonTypeVariants } from '@/shared/components/button';
import { ZardIdDirective } from '@/shared/core';
import { comboboxVariants, type ZardComboboxWidthVariants } from '@/shared/components/combobox/combobox.variants';
import {
  ZardCommandComponent,
  ZardCommandEmptyComponent,
  ZardCommandInputComponent,
  ZardCommandListComponent,
  ZardCommandOptionComponent,
  ZardCommandOptionGroupComponent,
  type ZardCommandOption,
} from '@/shared/components/command';
import { ZardEmptyComponent } from '@/shared/components/empty';
import { ZardIconComponent, type ZardIcon } from '@/shared/components/icon';
import { ZardPopoverComponent, ZardPopoverDirective } from '@/shared/components/popover';
import { mergeClasses } from '@/shared/utils/merge-classes';

export interface ZardComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: ZardIcon;
}

export interface ZardComboboxGroup {
  label?: string;
  options: ZardComboboxOption[];
}

@Component({
  selector: 'z-combobox',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCommandComponent,
    ZardCommandInputComponent,
    ZardCommandListComponent,
    ZardCommandEmptyComponent,
    ZardCommandOptionComponent,
    ZardCommandOptionGroupComponent,
    ZardPopoverDirective,
    ZardPopoverComponent,
    ZardEmptyComponent,
    ZardIconComponent,
    ZardIdDirective,
  ],
  template: `
    <button
      type="button"
      z-button
      zPopover
      zardId="combobox"
      #z="zardId"
      role="combobox"
      [id]="zId() || z.id()"
      [zContent]="popoverContent"
      [zType]="buttonVariant()"
      [class]="buttonClasses()"
      [zDisabled]="disabled()"
      [attr.aria-expanded]="open()"
      [attr.aria-haspopup]="'listbox'"
      [attr.aria-controls]="'combobox-listbox'"
      [attr.aria-label]="ariaLabel() || 'Select option'"
      [attr.aria-describedby]="ariaDescribedBy()"
      [attr.aria-autocomplete]="searchable() ? 'list' : 'none'"
      [attr.aria-activedescendant]="null"
      (zVisibleChange)="setOpen($event)"
      #popoverTrigger
    >
      <span [class]="valueContainerClasses()">
        @if (multiple()) {
          <span class="flex min-w-0 flex-wrap items-center gap-1.5">
            @for (label of displayLabels(); track $index) {
              <z-badge zType="secondary" class="max-w-[120px] truncate">
                <span class="truncate">{{ label }}</span>
              </z-badge>
            } @empty {
              <span class="text-muted-foreground truncate">{{ placeholder() }}</span>
            }
          </span>
        } @else {
          @if (selectedOption(); as selectedOption) {
            @if (selectedOption.icon; as selectedIcon) {
              <z-icon zSize="sm" [zType]="selectedIcon" class="shrink-0 text-primary opacity-70" />
            }
          }
          <span class="truncate">{{ displayValue() ?? placeholder() }}</span>
        }
      </span>
      <z-icon zType="chevrons-up-down" [class]="chevronClasses()" />
    </button>

    <ng-template #popoverContent>
      <z-popover [class]="popoverClasses()">
        <z-command class="min-h-auto" (zCommandSelected)="handleSelect($event)" #commandRef>
          @if (searchable()) {
            <z-command-input [placeholder]="searchPlaceholder()" #commandInputRef />
          }

          <z-command-list id="combobox-listbox" role="listbox" [attr.aria-multiselectable]="multiple() ? 'true' : null">
            @if (emptyText()) {
              <z-command-empty>
                <z-empty [zDescription]="emptyText()" />
              </z-command-empty>
            }

            @for (group of groups(); track group.label ?? $index) {
              @if (group.label) {
                <z-command-option-group [zLabel]="group.label" #commandGroup>
                  @for (option of group.options; track option.value) {
                    <ng-container
                      [ngTemplateOutlet]="commandOption"
                      [ngTemplateOutletContext]="{
                        $implicit: option,
                        commandInstance: commandRef,
                        groupInstance: commandGroup,
                      }"
                    />
                  }
                </z-command-option-group>
              } @else {
                @for (option of group.options; track option.value) {
                  <ng-container
                    [ngTemplateOutlet]="commandOption"
                    [ngTemplateOutletContext]="{
                      $implicit: option,
                      commandInstance: commandRef,
                    }"
                  />
                }
              }
            } @empty {
              @if (options().length > 0) {
                @for (option of options(); track option.value) {
                  <ng-container
                    [ngTemplateOutlet]="commandOption"
                    [ngTemplateOutletContext]="{
                      $implicit: option,
                      commandInstance: commandRef,
                    }"
                  />
                }
              }
            }
          </z-command-list>
        </z-command>
      </z-popover>
    </ng-template>

    <ng-template #commandOption let-option let-cmd="commandInstance" let-grp="groupInstance">
      <z-command-option
        [zValue]="option.value"
        [zLabel]="option.label"
        [zDisabled]="option.disabled ?? false"
        [zIcon]="option.icon"
        [zSelected]="isOptionSelected(option.value)"
        [zShowSelectedIndicator]="multiple()"
        [parentCommand]="cmd"
        [commandGroup]="grp"
      />
    </ng-template>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ZardComboboxComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '(document:keydown.escape)': 'onDocumentKeyDown($event)',
    '(keydown.escape.prevent-with-stop)': 'onKeyDownEscape()',
    '(keydown.{arrowdown,arrowup,enter,home,end,pageup,pagedown,space}.prevent)': 'onKeyDown($event)',
    '(keydown.tab)': 'onKeyDown($event)',
  },
  exportAs: 'zCombobox',
})
export class ZardComboboxComponent implements ControlValueAccessor {
  private readonly injector = inject(Injector);

  readonly zId = input<string>('');
  readonly class = input<ClassValue>('');
  readonly buttonVariant = input<ZardButtonTypeVariants>('outline');
  readonly zButtonClass = input<ClassValue>('');
  readonly zChevronClass = input<ClassValue>('opacity-50');
  readonly zWidth = input<ZardComboboxWidthVariants>('default');
  readonly placeholder = input<string>('Select...');
  readonly searchPlaceholder = input<string>('Search...');
  readonly emptyText = input<string>('No results found.');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly searchable = input(true, { transform: booleanAttribute });
  readonly multiple = input(false, { transform: booleanAttribute });
  readonly maxLabelCount = input(1);
  readonly value = input<string | readonly string[] | null | undefined>(undefined);
  readonly options = input<ZardComboboxOption[]>([]);
  readonly groups = input<ZardComboboxGroup[]>([]);
  readonly ariaLabel = input<string>('');
  readonly ariaDescribedBy = input<string>('');

  readonly zValueChange = output<string | string[] | null>();
  readonly zComboSelected = output<ZardComboboxOption>();

  readonly popoverDirective = viewChild.required('popoverTrigger', { read: ZardPopoverDirective });
  readonly buttonRef = viewChild.required('popoverTrigger', { read: ElementRef });
  readonly commandRef = viewChild('commandRef', { read: ZardCommandComponent });
  readonly commandInputRef = viewChild('commandInputRef', { read: ZardCommandInputComponent });

  protected readonly open = signal(false);
  protected readonly internalValue = signal<string | readonly string[] | null>(null);

  protected readonly classes = computed(() =>
    mergeClasses(
      comboboxVariants({
        zWidth: this.zWidth(),
      }),
      this.class(),
    ),
  );

  protected readonly buttonClasses = computed(() =>
    mergeClasses(
      'w-full justify-between',
      this.multiple() ? 'h-auto min-h-9 py-1.5' : '',
      this.zButtonClass(),
    ),
  );
  protected readonly valueContainerClasses = computed(() =>
    mergeClasses('min-w-0 flex-1 text-left', this.multiple() ? '' : 'flex items-center gap-2'),
  );
  protected readonly chevronClasses = computed(() => mergeClasses('ml-2 shrink-0', this.zChevronClass()));

  protected readonly popoverClasses = computed(() => {
    const widthClass = this.zWidth() === 'full' ? 'w-full' : comboboxVariants({ zWidth: this.zWidth() });
    return `${widthClass} p-0`;
  });

  protected readonly currentValue = computed<string | readonly string[] | null>(() => {
    const controlledValue = this.value();
    return controlledValue !== undefined ? controlledValue : this.internalValue();
  });
  protected readonly selectedOption = computed(() => {
    if (this.multiple()) {
      return null;
    }

    const currentValue = this.currentValue();
    if (typeof currentValue !== 'string' || currentValue.length === 0) {
      return null;
    }

    return this.getOptionByValue(currentValue);
  });

  protected readonly displayValue = computed(() => {
    return this.selectedOption()?.label ?? null;
  });
  protected readonly selectedValues = computed<string[]>(() => {
    if (!this.multiple()) {
      return [];
    }

    const currentValue = this.currentValue();
    if (Array.isArray(currentValue)) {
      return currentValue.filter((value) => typeof value === 'string' && value.trim().length > 0);
    }

    if (typeof currentValue === 'string' && currentValue.trim().length > 0) {
      return [currentValue];
    }

    return [];
  });
  protected readonly displayLabels = computed<string[]>(() => {
    const selectedValues = this.selectedValues();
    const labels = selectedValues.map((value) => this.getOptionByValue(value)?.label ?? value);
    const maxLabelCount = Math.max(0, this.maxLabelCount());

    if (maxLabelCount <= 0 || labels.length <= maxLabelCount) {
      return labels;
    }

    const hiddenCount = labels.length - maxLabelCount;
    return [...labels.slice(0, maxLabelCount), `${hiddenCount} more`];
  });

  private onChange: (value: string | string[] | null) => void = () => {
    // ControlValueAccessor implementation
  };

  private onTouched: () => void = () => {
    // ControlValueAccessor implementation
  };

  setOpen(open: boolean) {
    this.open.set(open);
    if (open) {
      runInInjectionContext(this.injector, () =>
        afterNextRender(() => {
          const commandRef = this.commandRef();
          if (commandRef) {
            // Refresh options to ensure they're detected
            commandRef.refreshOptions();
            // Focus on search input if searchable, otherwise on command component
            if (this.searchable()) {
              this.commandInputRef()?.focus();
            } else {
              commandRef.focus();
            }
          }
        }),
      );
    }
  }

  handleSelect(commandOption: ZardCommandOption) {
    const selectedValue = commandOption.value as string;

    if (this.multiple()) {
      const selectedValues = this.selectedValues();
      const alreadySelected = selectedValues.includes(selectedValue);
      const nextValues = alreadySelected
        ? selectedValues.filter((value) => value !== selectedValue)
        : [...selectedValues, selectedValue];

      this.internalValue.set(nextValues);
      this.onChange(nextValues);
      this.zValueChange.emit(nextValues);

      const selectedOption = this.getOptionByValue(selectedValue);
      if (selectedOption && !alreadySelected) {
        this.zComboSelected.emit(selectedOption);
      }

      return;
    }

    // Toggle behavior - if same value is selected, clear it
    const currentValue = this.currentValue();
    const newValue = selectedValue === currentValue ? null : selectedValue;

    this.internalValue.set(newValue);
    this.onChange(newValue);
    this.zValueChange.emit(newValue);

    // Emit the combobox option if we have a selection
    if (newValue) {
      const selectedOption = this.getOptionByValue(newValue);
      if (selectedOption) {
        this.zComboSelected.emit(selectedOption);
      }
    }

    // Close the popover
    this.popoverDirective().hide();

    // Return focus to the combobox button after selection
    this.buttonRef().nativeElement.focus();
  }

  onKeyDownEscape(): void {
    if (this.open()) {
      this.popoverDirective().hide();
      this.buttonRef().nativeElement.focus();
      return;
    }

    if (this.multiple()) {
      if (this.selectedValues().length > 0) {
        this.internalValue.set([]);
        this.onChange([]);
        this.zValueChange.emit([]);
      }
      return;
    }

    if (this.currentValue()) {
      this.internalValue.set(null);
      this.onChange(null);
      this.zValueChange.emit(null);
    }
  }

  onKeyDown(e: Event) {
    if (this.disabled()) {
      return;
    }

    const { key, ctrlKey, altKey, metaKey } = e as KeyboardEvent;

    // Handle different keyboard events based on combobox state
    if (this.open()) {
      // When popover is open
      switch (key) {
        case 'Tab':
          // Allow tab to close and move to next element
          this.popoverDirective().hide();
          break;
        case 'ArrowDown':
        case 'ArrowUp':
        case 'Enter':
        case 'Home':
        case 'End':
        case 'PageUp':
        case 'PageDown':
          // Forward navigation to command component
          this.commandRef()?.onKeyDown(e as KeyboardEvent);
          break;
      }
    } else {
      // When popover is closed
      switch (key) {
        case 'ArrowDown':
        case 'ArrowUp':
        case 'Enter':
        case ' ': // Space key
          this.popoverDirective().show();
          break;
        default:
          // For searchable comboboxes, open and start typing
          if (this.searchable() && key.length === 1 && !ctrlKey && !altKey && !metaKey) {
            this.popoverDirective().show();
            // Let the command input handle the character after opening
            runInInjectionContext(this.injector, () =>
              afterNextRender(() => {
                const inputElement = this.commandInputRef();
                if (inputElement) {
                  inputElement.searchInput().nativeElement.value = key;
                  inputElement.updateParentComponents(key);
                  inputElement.focus();
                }
              }),
            );
          }
          break;
      }
    }
  }

  // needed when component loses focus by keyboard.
  onDocumentKeyDown(event: Event) {
    // Close on Escape from anywhere when this combobox is open
    if (this.open()) {
      const target = event.target as Element;
      const buttonElement = this.buttonRef().nativeElement;
      // Only handle if not already handled by the component itself
      if (!buttonElement.contains(target)) {
        this.popoverDirective().hide();
        this.buttonRef().nativeElement.focus();
      }
    }
  }

  protected isOptionSelected(value: string): boolean {
    if (this.multiple()) {
      return this.selectedValues().includes(value);
    }

    return this.currentValue() === value;
  }

  // ControlValueAccessor implementation
  writeValue(value: string | readonly string[] | null): void {
    this.internalValue.set(value);
  }

  registerOnChange(fn: (value: string | string[] | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  private getOptionByValue(value: string): ZardComboboxOption | null {
    if (this.groups().length > 0) {
      for (const group of this.groups()) {
        const option = group.options.find(opt => opt.value === value);
        if (option) {
          return option;
        }
      }
    }

    return this.options().find(opt => opt.value === value) ?? null;
  }
}
