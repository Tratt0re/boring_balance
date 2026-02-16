import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { APP_COLOR_KEY_SET, APP_COLOR_OPTIONS, APP_ICON_KEY_SET, APP_ICON_OPTIONS } from '@/config/visual-options.config';
import type { AccountCreateDto } from '@/dtos';
import { ZardComboboxComponent, type ZardComboboxOption } from '@/shared/components/combobox';
import { ZardInputDirective } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';

@Component({
  selector: 'app-add-account-dialog',
  imports: [TranslatePipe, ZardInputDirective, ZardComboboxComponent, ...ZardSelectImports],
  templateUrl: './add-account-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddAccountDialogComponent {
  protected readonly colorOptions = APP_COLOR_OPTIONS;
  protected readonly iconOptions = APP_ICON_OPTIONS;

  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly colorKey = signal('');
  protected readonly icon = signal('');
  protected readonly nameTouched = signal(false);
  protected readonly descriptionTouched = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected readonly nameErrorKey = computed(() => this.getNameError(this.name()));
  protected readonly descriptionErrorKey = computed(() => this.getDescriptionError(this.description()));
  protected readonly visibleNameErrorKey = computed(() =>
    this.submitAttempted() || this.nameTouched() ? this.nameErrorKey() : null,
  );
  protected readonly visibleDescriptionErrorKey = computed(() =>
    this.submitAttempted() || this.descriptionTouched() ? this.descriptionErrorKey() : null,
  );

  constructor(private readonly translateService: TranslateService) {}

  public collectCreatePayload(): AccountCreateDto | null {
    this.submitAttempted.set(true);
    this.nameTouched.set(true);
    this.descriptionTouched.set(true);

    if (this.hasValidationError()) {
      this.errorKey.set('accounts.dialog.add.errors.fixValidation');
      return null;
    }

    const name = this.normalizeRequiredString(this.name());
    if (!name) {
      this.errorKey.set('accounts.dialog.add.errors.nameRequired');
      return null;
    }

    this.errorKey.set(null);
    return {
      name,
      description: this.normalizeNullableString(this.description()),
      color_key: this.normalizeColor(this.colorKey()),
      icon: this.normalizeIcon(this.icon()),
    };
  }

  public setSubmitError(errorKey: string | null): void {
    this.errorKey.set(errorKey);
  }

  protected onNameInput(event: Event): void {
    const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
    this.name.set(nextValue);
    if (this.errorKey()) {
      this.errorKey.set(null);
    }
  }

  protected onNameBlur(): void {
    this.nameTouched.set(true);
  }

  protected onDescriptionInput(event: Event): void {
    const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
    this.description.set(nextValue);
    if (this.errorKey()) {
      this.errorKey.set(null);
    }
  }

  protected onDescriptionBlur(): void {
    this.descriptionTouched.set(true);
  }

  protected onColorChange(value: string | string[]): void {
    if (Array.isArray(value)) {
      return;
    }

    this.colorKey.set(value);
    if (this.errorKey()) {
      this.errorKey.set(null);
    }
  }

  protected onIconChange(value: string | null): void {
    this.icon.set(value ?? '');
    if (this.errorKey()) {
      this.errorKey.set(null);
    }
  }

  protected getIconComboboxOptions(): ZardComboboxOption[] {
    return this.iconOptions.map((option) => ({
      value: option.value,
      label: this.translateService.instant(option.label),
      icon: option.icon,
    }));
  }

  private hasValidationError(): boolean {
    return this.nameErrorKey() !== null || this.descriptionErrorKey() !== null;
  }

  private getNameError(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return 'accounts.dialog.add.errors.nameRequired';
    }
    if (trimmed.length < 2) {
      return 'accounts.dialog.add.errors.nameMinLength';
    }
    if (trimmed.length > 64) {
      return 'accounts.dialog.add.errors.nameMaxLength';
    }
    return null;
  }

  private getDescriptionError(value: string): string | null {
    if (value.trim().length > 160) {
      return 'accounts.dialog.add.errors.descriptionMaxLength';
    }
    return null;
  }

  private normalizeRequiredString(value: unknown): string | null {
    const normalized = this.normalizeNullableString(value);
    return normalized && normalized.length > 0 ? normalized : null;
  }

  private normalizeNullableString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const text = `${value}`.trim();
    return text.length > 0 ? text : null;
  }

  private normalizeColor(value: unknown): string | null {
    const color = this.normalizeNullableString(value);
    if (!color) {
      return null;
    }

    return APP_COLOR_KEY_SET.has(color) ? color : null;
  }

  private normalizeIcon(value: unknown): string | null {
    const icon = this.normalizeNullableString(value);
    if (!icon) {
      return null;
    }

    return APP_ICON_KEY_SET.has(icon) ? icon : null;
  }
}
