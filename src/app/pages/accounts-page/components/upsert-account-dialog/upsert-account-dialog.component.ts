import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { APP_COLOR_KEY_SET, APP_COLOR_OPTIONS, APP_ICON_KEY_SET, APP_ICON_OPTIONS } from '@/config/visual-options.config';
import type { AccountCreateDto, AccountUpdateDto } from '@/dtos';
import { ZardComboboxComponent, type ZardComboboxOption } from '@/shared/components/combobox';
import { Z_MODAL_DATA } from '@/shared/components/dialog';
import { ZardInputDirective } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';

export interface AccountDialogInitialValue {
  readonly name: string;
  readonly description: string | null;
  readonly colorKey: string | null;
  readonly icon: string | null;
}

export interface UpsertAccountDialogData {
  readonly account?: AccountDialogInitialValue;
}

@Component({
  selector: 'app-upsert-account-dialog',
  imports: [TranslatePipe, ZardInputDirective, ZardComboboxComponent, ...ZardSelectImports],
  templateUrl: './upsert-account-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpsertAccountDialogComponent {
  private readonly data = inject<UpsertAccountDialogData | null>(Z_MODAL_DATA, { optional: true });
  private readonly initialAccount = this.data?.account;

  protected readonly colorOptions = APP_COLOR_OPTIONS;
  protected readonly iconOptions = APP_ICON_OPTIONS;

  protected readonly name = signal(this.initialAccount?.name ?? '');
  protected readonly description = signal(this.initialAccount?.description ?? '');
  protected readonly colorKey = signal(this.initialAccount?.colorKey ?? '');
  protected readonly icon = signal(this.initialAccount?.icon ?? '');
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
    const changes = this.collectNormalizedChanges('accounts.dialog.add.errors.fixValidation');
    if (!changes) {
      return null;
    }

    const name = changes.name;
    if (!name) {
      this.errorKey.set('accounts.dialog.add.errors.nameRequired');
      return null;
    }

    return {
      name,
      description: changes.description,
      color_key: changes.color_key,
      icon: changes.icon,
    };
  }

  public collectUpdateChanges(): AccountUpdateDto['changes'] | null {
    return this.collectNormalizedChanges('accounts.dialog.edit.errors.fixValidation');
  }

  public setSubmitError(errorKey: string | null): void {
    this.errorKey.set(errorKey);
  }

  protected onNameInput(event: Event): void {
    const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
    this.name.set(nextValue);
    this.clearSubmitError();
  }

  protected onNameBlur(): void {
    this.nameTouched.set(true);
  }

  protected onDescriptionInput(event: Event): void {
    const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
    this.description.set(nextValue);
    this.clearSubmitError();
  }

  protected onDescriptionBlur(): void {
    this.descriptionTouched.set(true);
  }

  protected onColorChange(value: string | string[]): void {
    if (Array.isArray(value)) {
      return;
    }

    this.colorKey.set(value);
    this.clearSubmitError();
  }

  protected onIconChange(value: string | string[] | null): void {
    if (Array.isArray(value)) {
      return;
    }

    this.icon.set(value ?? '');
    this.clearSubmitError();
  }

  protected getIconComboboxOptions(): ZardComboboxOption[] {
    return this.iconOptions.map((option) => ({
      value: option.value,
      label: this.translateService.instant(option.label),
      icon: option.icon,
    }));
  }

  private collectNormalizedChanges(invalidFormErrorKey: string): AccountUpdateDto['changes'] | null {
    this.submitAttempted.set(true);
    this.nameTouched.set(true);
    this.descriptionTouched.set(true);

    if (this.hasValidationError()) {
      this.errorKey.set(invalidFormErrorKey);
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

  private clearSubmitError(): void {
    if (this.errorKey()) {
      this.errorKey.set(null);
    }
  }
}
