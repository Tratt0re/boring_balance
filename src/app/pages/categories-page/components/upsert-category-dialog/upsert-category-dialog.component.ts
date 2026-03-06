import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { APP_COLOR_OPTIONS, APP_ICON_OPTIONS, normalizeColorKey, normalizeIconKey } from '@/config/visual-options.config';
import type { CategoryCreateDto, CategoryType, CategoryUpdateDto } from '@/dtos';
import { normalizeNullableString, normalizeRequiredString } from '@/shared/utils/dialog-form-utils';
import { ZardComboboxComponent, type ZardComboboxOption } from '@/shared/components/combobox';
import { Z_MODAL_DATA } from '@/shared/components/dialog';
import { ZardInputDirective } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';

const CATEGORY_NAME_MIN_LENGTH = 2;
const CATEGORY_NAME_MAX_LENGTH = 64;
const CATEGORY_DESCRIPTION_MAX_LENGTH = 50;

const CATEGORY_TYPE_OPTIONS = [
  { label: 'category.type.income', value: 'income' },
  { label: 'category.type.expense', value: 'expense' },
  { label: 'category.type.exclude', value: 'exclude' },
] as const;

export interface CategoryDialogInitialValue {
  readonly name: string;
  readonly description: string | null;
  readonly colorKey: string | null;
  readonly icon: string | null;
  readonly type: CategoryType;
}

export interface UpsertCategoryDialogData {
  readonly category?: CategoryDialogInitialValue;
}

@Component({
  selector: 'app-upsert-category-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, ZardInputDirective, ZardComboboxComponent, ...ZardSelectImports],
  templateUrl: './upsert-category-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpsertCategoryDialogComponent {
  private readonly data = inject<UpsertCategoryDialogData | null>(Z_MODAL_DATA, { optional: true });
  private readonly initialCategory = this.data?.category;

  protected readonly colorOptions = APP_COLOR_OPTIONS;
  protected readonly iconOptions = APP_ICON_OPTIONS;
  protected readonly typeOptions = CATEGORY_TYPE_OPTIONS;
  protected readonly descriptionMaxLength = CATEGORY_DESCRIPTION_MAX_LENGTH;

  protected readonly form = new FormGroup({
    name: new FormControl(this.initialCategory?.name ?? '', { nonNullable: true }),
    description: new FormControl(this.initialCategory?.description ?? '', { nonNullable: true }),
    colorKey: new FormControl(this.initialCategory?.colorKey ?? '', { nonNullable: true }),
    icon: new FormControl<string | null>(this.initialCategory?.icon ?? null),
    type: new FormControl<CategoryType | ''>(this.initialCategory?.type ?? '', { nonNullable: true }),
  });

  protected readonly submitAttempted = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  constructor(private readonly translateService: TranslateService) {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.clearSubmitError();
    });
  }

  public collectCreatePayload(): CategoryCreateDto | null {
    const changes = this.collectNormalizedChanges('categories.dialog.add.errors.fixValidation');
    if (!changes) {
      return null;
    }

    if (!this.isCategoryCreateDto(changes)) {
      return null;
    }

    return changes;
  }

  public collectUpdateChanges(): CategoryUpdateDto['changes'] | null {
    return this.collectNormalizedChanges('categories.dialog.edit.errors.fixValidation');
  }

  public setSubmitError(errorKey: string | null): void {
    this.errorKey.set(errorKey);
  }

  protected visibleNameErrorKey(): string | null {
    const control = this.form.controls.name;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getNameError(control.value);
  }

  protected visibleDescriptionErrorKey(): string | null {
    const control = this.form.controls.description;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getDescriptionError(control.value);
  }

  protected visibleTypeErrorKey(): string | null {
    const control = this.form.controls.type;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getTypeError(control.value);
  }

  protected descriptionLength(): number {
    return this.form.controls.description.value.length;
  }

  protected getIconComboboxOptions(): ZardComboboxOption[] {
    return this.iconOptions.map((option) => ({
      value: option.value,
      label: this.translateService.instant(option.label),
      icon: option.icon,
    }));
  }

  private collectNormalizedChanges(invalidFormErrorKey: string): CategoryUpdateDto['changes'] | null {
    this.submitAttempted.set(true);
    this.form.markAllAsTouched();

    if (this.hasValidationError()) {
      this.errorKey.set(invalidFormErrorKey);
      return null;
    }

    const values = this.form.getRawValue();
    const name = normalizeRequiredString(values.name);
    if (!name) {
      this.errorKey.set('categories.dialog.add.errors.nameRequired');
      return null;
    }

    const type = values.type;
    if (!this.isCategoryType(type)) {
      this.errorKey.set('categories.dialog.add.errors.typeRequired');
      return null;
    }

    this.errorKey.set(null);
    return {
      name,
      description: normalizeNullableString(values.description),
      color_key: normalizeColorKey(values.colorKey),
      icon: normalizeIconKey(values.icon),
      type,
    };
  }

  private hasValidationError(): boolean {
    return (
      this.getNameError(this.form.controls.name.value) !== null ||
      this.getDescriptionError(this.form.controls.description.value) !== null ||
      this.getTypeError(this.form.controls.type.value) !== null
    );
  }

  private getNameError(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return 'categories.dialog.add.errors.nameRequired';
    }

    if (trimmed.length < CATEGORY_NAME_MIN_LENGTH) {
      return 'categories.dialog.add.errors.nameMinLength';
    }

    if (trimmed.length > CATEGORY_NAME_MAX_LENGTH) {
      return 'categories.dialog.add.errors.nameMaxLength';
    }

    return null;
  }

  private getDescriptionError(value: string): string | null {
    if (value.length > CATEGORY_DESCRIPTION_MAX_LENGTH) {
      return 'categories.dialog.add.errors.descriptionMaxLength';
    }

    return null;
  }

  private getTypeError(value: unknown): string | null {
    if (!this.isCategoryType(value)) {
      return 'categories.dialog.add.errors.typeRequired';
    }

    return null;
  }

  private isCategoryType(value: unknown): value is CategoryType {
    return value === 'income' || value === 'expense' || value === 'exclude';
  }

  private isCategoryCreateDto(changes: CategoryUpdateDto['changes']): changes is CategoryCreateDto {
    return this.isCategoryType(changes.type);
  }

  private clearSubmitError(): void {
    if (this.errorKey()) {
      this.errorKey.set(null);
    }
  }
}
