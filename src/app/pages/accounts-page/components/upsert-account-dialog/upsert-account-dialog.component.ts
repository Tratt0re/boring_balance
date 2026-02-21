import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { APP_COLOR_KEY_SET, APP_COLOR_OPTIONS, APP_ICON_KEY_SET, APP_ICON_OPTIONS } from '@/config/visual-options.config';
import type { AccountCreateDto, AccountType, AccountUpdateDto } from '@/dtos';
import { ZardComboboxComponent, type ZardComboboxOption } from '@/shared/components/combobox';
import { Z_MODAL_DATA } from '@/shared/components/dialog';
import { ZardInputDirective } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';

const ACCOUNT_NAME_MIN_LENGTH = 2;
const ACCOUNT_NAME_MAX_LENGTH = 64;
const ACCOUNT_DESCRIPTION_MAX_LENGTH = 50;

const ACCOUNT_TYPE_OPTIONS = [
  { label: 'account.type.cash', value: 'cash' },
  { label: 'account.type.bank', value: 'bank' },
  { label: 'account.type.savings', value: 'savings' },
  { label: 'account.type.brokerage', value: 'brokerage' },
  { label: 'account.type.crypto', value: 'crypto' },
  { label: 'account.type.credit', value: 'credit' },
] as const;

export interface AccountDialogInitialValue {
  readonly name: string;
  readonly type: AccountType;
  readonly description: string | null;
  readonly colorKey: string | null;
  readonly icon: string | null;
}

export interface UpsertAccountDialogData {
  readonly account?: AccountDialogInitialValue;
}

@Component({
  selector: 'app-upsert-account-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, ZardInputDirective, ZardComboboxComponent, ...ZardSelectImports],
  templateUrl: './upsert-account-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpsertAccountDialogComponent {
  private readonly data = inject<UpsertAccountDialogData | null>(Z_MODAL_DATA, { optional: true });
  private readonly initialAccount = this.data?.account;

  protected readonly colorOptions = APP_COLOR_OPTIONS;
  protected readonly iconOptions = APP_ICON_OPTIONS;
  protected readonly typeOptions = ACCOUNT_TYPE_OPTIONS;
  protected readonly descriptionMaxLength = ACCOUNT_DESCRIPTION_MAX_LENGTH;

  protected readonly form = new FormGroup({
    name: new FormControl(this.initialAccount?.name ?? '', { nonNullable: true }),
    type: new FormControl<AccountType | ''>(this.initialAccount?.type ?? '', { nonNullable: true }),
    description: new FormControl(this.initialAccount?.description ?? '', { nonNullable: true }),
    colorKey: new FormControl(this.initialAccount?.colorKey ?? '', { nonNullable: true }),
    icon: new FormControl<string | null>(this.initialAccount?.icon ?? null),
  });

  protected readonly submitAttempted = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  constructor(private readonly translateService: TranslateService) {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.clearSubmitError();
    });
  }

  public collectCreatePayload(): AccountCreateDto | null {
    const changes = this.collectNormalizedChanges('accounts.dialog.add.errors.fixValidation');
    if (!changes) {
      return null;
    }

    if (!this.isAccountCreateDto(changes)) {
      return null;
    }

    const name = changes.name;
    if (!name) {
      this.errorKey.set('accounts.dialog.add.errors.nameRequired');
      return null;
    }

    return {
      name,
      type: changes.type,
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

  protected visibleNameErrorKey(): string | null {
    const control = this.form.controls.name;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getNameError(control.value);
  }

  protected visibleTypeErrorKey(): string | null {
    const control = this.form.controls.type;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getTypeError(control.value);
  }

  protected visibleDescriptionErrorKey(): string | null {
    const control = this.form.controls.description;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getDescriptionError(control.value);
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

  private collectNormalizedChanges(invalidFormErrorKey: string): AccountUpdateDto['changes'] | null {
    this.submitAttempted.set(true);
    this.form.markAllAsTouched();

    if (this.hasValidationError()) {
      this.errorKey.set(invalidFormErrorKey);
      return null;
    }

    const values = this.form.getRawValue();
    const name = this.normalizeRequiredString(values.name);
    if (!name) {
      this.errorKey.set('accounts.dialog.add.errors.nameRequired');
      return null;
    }

    const type = values.type;
    if (!this.isAccountType(type)) {
      this.errorKey.set('accounts.dialog.add.errors.typeRequired');
      return null;
    }

    this.errorKey.set(null);
    return {
      name,
      type,
      description: this.normalizeNullableString(values.description),
      color_key: this.normalizeColor(values.colorKey),
      icon: this.normalizeIcon(values.icon),
    };
  }

  private hasValidationError(): boolean {
    return (
      this.getNameError(this.form.controls.name.value) !== null ||
      this.getTypeError(this.form.controls.type.value) !== null ||
      this.getDescriptionError(this.form.controls.description.value) !== null
    );
  }

  private getNameError(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return 'accounts.dialog.add.errors.nameRequired';
    }

    if (trimmed.length < ACCOUNT_NAME_MIN_LENGTH) {
      return 'accounts.dialog.add.errors.nameMinLength';
    }

    if (trimmed.length > ACCOUNT_NAME_MAX_LENGTH) {
      return 'accounts.dialog.add.errors.nameMaxLength';
    }

    return null;
  }

  private getDescriptionError(value: string): string | null {
    if (value.length > ACCOUNT_DESCRIPTION_MAX_LENGTH) {
      return 'accounts.dialog.add.errors.descriptionMaxLength';
    }

    return null;
  }

  private getTypeError(value: unknown): string | null {
    if (!this.isAccountType(value)) {
      return 'accounts.dialog.add.errors.typeRequired';
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

  private isAccountType(value: unknown): value is AccountType {
    return (
      value === 'cash' ||
      value === 'bank' ||
      value === 'savings' ||
      value === 'brokerage' ||
      value === 'crypto' ||
      value === 'credit'
    );
  }

  private isAccountCreateDto(changes: AccountUpdateDto['changes']): changes is AccountCreateDto {
    return this.isAccountType(changes.type);
  }

  private clearSubmitError(): void {
    if (this.errorKey()) {
      this.errorKey.set(null);
    }
  }
}
