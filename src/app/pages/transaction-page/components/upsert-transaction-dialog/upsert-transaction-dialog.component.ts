import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import type { EditableOptionItem } from '@/components/data-table';
import type { TransactionCreateDto, TransactionUpdateDto } from '@/dtos';
import { NumberFormatService } from '@/services/number-format.service';
import { ZardComboboxComponent, type ZardComboboxOption } from '@/shared/components/combobox';
import { ZardDatePickerComponent } from '@/shared/components/date-picker';
import { Z_MODAL_DATA } from '@/shared/components/dialog';
import { ZardInputDirective } from '@/shared/components/input';
import { ZardSwitchComponent } from '@/shared/components/switch';

const TRANSACTION_DESCRIPTION_MAX_LENGTH = 75;

export interface TransactionDialogInitialValue {
  readonly occurredAt: number;
  readonly settled: boolean;
  readonly accountId: number;
  readonly amount: number;
  readonly categoryId: number;
  readonly description: string | null;
}

interface NormalizedTransactionValues {
  readonly occurredAt: number;
  readonly settled: boolean;
  readonly accountId: number;
  readonly amount: number;
  readonly categoryId: number;
  readonly description: string | null;
}

export interface UpsertTransactionDialogData {
  readonly accountOptions: readonly EditableOptionItem[];
  readonly categoryOptions: readonly EditableOptionItem[];
  readonly transaction?: TransactionDialogInitialValue;
}

@Component({
  selector: 'app-upsert-transaction-dialog',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    ZardComboboxComponent,
    ZardDatePickerComponent,
    ZardInputDirective,
    ZardSwitchComponent,
  ],
  templateUrl: './upsert-transaction-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpsertTransactionDialogComponent {
  protected readonly numberFormatService = inject(NumberFormatService);
  private readonly translateService = inject(TranslateService);
  private readonly data = inject<UpsertTransactionDialogData | null>(Z_MODAL_DATA, { optional: true });
  private readonly initialTransaction = this.data?.transaction;

  protected readonly accountOptions: readonly ZardComboboxOption[] = this.toDialogOptions(this.data?.accountOptions);
  protected readonly categoryOptions: readonly ZardComboboxOption[] = this.toDialogOptions(this.data?.categoryOptions);
  protected readonly descriptionMaxLength = TRANSACTION_DESCRIPTION_MAX_LENGTH;

  protected readonly form = new FormGroup({
    occurredAt: new FormControl<Date | null>(
      this.initialTransaction ? new Date(this.initialTransaction.occurredAt) : new Date(),
    ),
    settled: new FormControl(this.initialTransaction?.settled ?? false, { nonNullable: true }),
    accountId: new FormControl<string | null>(
      this.initialTransaction ? `${this.initialTransaction.accountId}` : null,
    ),
    amount: new FormControl(this.initialTransaction ? `${this.initialTransaction.amount}` : '', { nonNullable: true }),
    categoryId: new FormControl<string | null>(
      this.initialTransaction ? `${this.initialTransaction.categoryId}` : null,
    ),
    description: new FormControl(this.initialTransaction?.description ?? '', { nonNullable: true }),
  });

  protected readonly submitAttempted = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.clearSubmitError();
    });
  }

  public collectCreatePayload(): TransactionCreateDto | null {
    const values = this.collectNormalizedValues('transactions.dialog.add.errors.fixValidation');
    if (!values) {
      return null;
    }

    return {
      occurred_at: values.occurredAt,
      account_id: values.accountId,
      amount: values.amount,
      category_id: values.categoryId,
      description: values.description,
      settled: values.settled,
    };
  }

  public collectUpdateChanges(): TransactionUpdateDto['changes'] | null {
    const values = this.collectNormalizedValues('transactions.dialog.edit.errors.fixValidation');
    if (!values) {
      return null;
    }

    return {
      occurred_at: values.occurredAt,
      account_id: values.accountId,
      amount: values.amount,
      category_id: values.categoryId,
      description: values.description,
      settled: values.settled,
    };
  }

  public setSubmitError(errorKey: string | null): void {
    this.errorKey.set(errorKey);
  }

  protected visibleOccurredAtErrorKey(): string | null {
    const control = this.form.controls.occurredAt;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getOccurredAtError(control.value);
  }

  protected visibleAccountIdErrorKey(): string | null {
    const control = this.form.controls.accountId;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getAccountIdError(control.value);
  }

  protected visibleAmountErrorKey(): string | null {
    const control = this.form.controls.amount;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getAmountError(control.value);
  }

  protected visibleCategoryIdErrorKey(): string | null {
    const control = this.form.controls.categoryId;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getCategoryIdError(control.value);
  }

  protected visibleDescriptionErrorKey(): string | null {
    const control = this.form.controls.description;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getDescriptionError(control.value);
  }

  protected settledValue(): boolean {
    return this.form.controls.settled.value;
  }

  protected descriptionLength(): number {
    return this.form.controls.description.value.length;
  }

  private hasValidationError(): boolean {
    return (
      this.getOccurredAtError(this.form.controls.occurredAt.value) !== null ||
      this.getAccountIdError(this.form.controls.accountId.value) !== null ||
      this.getAmountError(this.form.controls.amount.value) !== null ||
      this.getCategoryIdError(this.form.controls.categoryId.value) !== null ||
      this.getDescriptionError(this.form.controls.description.value) !== null
    );
  }

  private collectNormalizedValues(invalidFormErrorKey: string): NormalizedTransactionValues | null {
    this.submitAttempted.set(true);
    this.form.markAllAsTouched();

    if (this.hasValidationError()) {
      this.errorKey.set(invalidFormErrorKey);
      return null;
    }

    const values = this.form.getRawValue();

    const occurredAt = this.toOccurredAt(values.occurredAt);
    if (occurredAt === null) {
      this.errorKey.set('transactions.dialog.add.errors.dateRequired');
      return null;
    }

    const accountId = this.toPositiveInteger(values.accountId);
    if (accountId === null) {
      this.errorKey.set('transactions.dialog.add.errors.accountRequired');
      return null;
    }

    const amount = this.toAmount(values.amount);
    if (amount === null) {
      this.errorKey.set('transactions.dialog.add.errors.amountInvalid');
      return null;
    }

    const categoryId = this.toPositiveInteger(values.categoryId);
    if (categoryId === null) {
      this.errorKey.set('transactions.dialog.add.errors.categoryRequired');
      return null;
    }

    this.errorKey.set(null);
    return {
      occurredAt,
      settled: values.settled,
      accountId,
      amount,
      categoryId,
      description: this.normalizeNullableString(values.description),
    };
  }

  private getOccurredAtError(value: Date | null): string | null {
    return this.toOccurredAt(value) === null ? 'transactions.dialog.add.errors.dateRequired' : null;
  }

  private getAccountIdError(value: unknown): string | null {
    return this.toPositiveInteger(value) === null ? 'transactions.dialog.add.errors.accountRequired' : null;
  }

  private getAmountError(value: string): string | null {
    if (value.trim().length === 0) {
      return 'transactions.dialog.add.errors.amountRequired';
    }

    return this.toAmount(value) === null ? 'transactions.dialog.add.errors.amountInvalid' : null;
  }

  private getCategoryIdError(value: unknown): string | null {
    return this.toPositiveInteger(value) === null ? 'transactions.dialog.add.errors.categoryRequired' : null;
  }

  private getDescriptionError(value: string): string | null {
    return value.length > TRANSACTION_DESCRIPTION_MAX_LENGTH
      ? 'transactions.dialog.add.errors.descriptionMaxLength'
      : null;
  }

  private toOccurredAt(value: Date | null): number | null {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return null;
    }

    return value.getTime();
  }

  private toPositiveInteger(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }

  private toAmount(value: unknown): number | null {
    if (value === null || value === undefined || `${value}`.trim().length === 0) {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed;
  }

  private normalizeNullableString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const text = `${value}`.trim();
    return text.length > 0 ? text : null;
  }

  private clearSubmitError(): void {
    if (this.errorKey()) {
      this.errorKey.set(null);
    }
  }

  private toDialogOptions(options: readonly EditableOptionItem[] | undefined): readonly ZardComboboxOption[] {
    return (options ?? []).map((option) => ({
      value: `${option.value}`,
      label: this.translateService.instant(option.label),
      icon: option.icon,
    }));
  }
}
