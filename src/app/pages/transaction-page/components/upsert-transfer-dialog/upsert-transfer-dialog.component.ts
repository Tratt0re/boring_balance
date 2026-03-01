import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import type { EditableOptionItem } from '@/components/data-table';
import type { TransactionCreateTransferDto, TransactionUpdateTransferDto } from '@/dtos';
import { NumberFormatService } from '@/services/number-format.service';
import { ZardComboboxComponent, type ZardComboboxOption } from '@/shared/components/combobox';
import { ZardDatePickerComponent } from '@/shared/components/date-picker';
import { Z_MODAL_DATA } from '@/shared/components/dialog';
import { ZardInputDirective } from '@/shared/components/input';
import { ZardSwitchComponent } from '@/shared/components/switch';

const TRANSFER_DESCRIPTION_MAX_LENGTH = 75;

export interface TransferDialogInitialValue {
  readonly transferId: string;
  readonly occurredAt: number;
  readonly settled: boolean;
  readonly fromAccountId: number;
  readonly toAccountId: number;
  readonly amount: number;
  readonly description: string | null;
}

export interface UpsertTransferDialogData {
  readonly accountOptions: readonly EditableOptionItem[];
  readonly transfer?: TransferDialogInitialValue;
}

@Component({
  selector: 'app-upsert-transfer-dialog',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    ZardComboboxComponent,
    ZardDatePickerComponent,
    ZardInputDirective,
    ZardSwitchComponent,
  ],
  templateUrl: './upsert-transfer-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpsertTransferDialogComponent {
  protected readonly numberFormatService = inject(NumberFormatService);
  private readonly translateService = inject(TranslateService);
  private readonly data = inject<UpsertTransferDialogData | null>(Z_MODAL_DATA, { optional: true });
  private readonly initialTransfer = this.data?.transfer;

  protected readonly accountOptions: readonly ZardComboboxOption[] = this.toDialogOptions(this.data?.accountOptions);
  protected readonly descriptionMaxLength = TRANSFER_DESCRIPTION_MAX_LENGTH;

  protected readonly form = new FormGroup({
    occurredAt: new FormControl<Date | null>(
      this.initialTransfer ? new Date(this.initialTransfer.occurredAt) : new Date(),
    ),
    settled: new FormControl(this.initialTransfer?.settled ?? true, { nonNullable: true }),
    fromAccountId: new FormControl<string | null>(
      this.initialTransfer ? `${this.initialTransfer.fromAccountId}` : null,
    ),
    toAccountId: new FormControl<string | null>(
      this.initialTransfer ? `${this.initialTransfer.toAccountId}` : null,
    ),
    amount: new FormControl(this.initialTransfer ? `${this.initialTransfer.amount}` : '', { nonNullable: true }),
    description: new FormControl(this.initialTransfer?.description ?? '', { nonNullable: true }),
  });

  protected readonly submitAttempted = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.clearSubmitError();
    });
  }

  public collectCreatePayload(): TransactionCreateTransferDto | null {
    const values = this.collectNormalizedValues('transactions.transfers.dialog.add.errors.fixValidation');
    if (!values) {
      return null;
    }

    return {
      occurred_at: values.occurredAt,
      from_account_id: values.fromAccountId,
      to_account_id: values.toAccountId,
      amount: values.amount,
      description: values.description,
      settled: values.settled,
    };
  }

  public collectUpdatePayload(): TransactionUpdateTransferDto | null {
    if (!this.initialTransfer?.transferId) {
      this.errorKey.set('transactions.transfers.dialog.edit.errors.updateFailed');
      return null;
    }

    const values = this.collectNormalizedValues('transactions.transfers.dialog.edit.errors.fixValidation');
    if (!values) {
      return null;
    }

    return {
      transfer_id: this.initialTransfer.transferId,
      occurred_at: values.occurredAt,
      from_account_id: values.fromAccountId,
      to_account_id: values.toAccountId,
      amount: values.amount,
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

  protected visibleFromAccountErrorKey(): string | null {
    const control = this.form.controls.fromAccountId;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getFromAccountError(control.value);
  }

  protected visibleToAccountErrorKey(): string | null {
    const control = this.form.controls.toAccountId;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getToAccountError(control.value, this.form.controls.fromAccountId.value);
  }

  protected visibleAmountErrorKey(): string | null {
    const control = this.form.controls.amount;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getAmountError(control.value);
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

  protected settledValue(): boolean {
    return this.form.controls.settled.value;
  }

  protected fromAccountComboboxOptions(): readonly ZardComboboxOption[] {
    const selectedToAccountId = this.form.controls.toAccountId.value;
    if (typeof selectedToAccountId !== 'string' || selectedToAccountId.length === 0) {
      return this.accountOptions;
    }

    return this.accountOptions.map((option) => ({
      ...option,
      disabled: option.value === selectedToAccountId,
    }));
  }

  protected toAccountComboboxOptions(): readonly ZardComboboxOption[] {
    const selectedFromAccountId = this.form.controls.fromAccountId.value;
    if (typeof selectedFromAccountId !== 'string' || selectedFromAccountId.length === 0) {
      return this.accountOptions;
    }

    return this.accountOptions.map((option) => ({
      ...option,
      disabled: option.value === selectedFromAccountId,
    }));
  }

  private collectNormalizedValues(invalidFormErrorKey: string): {
    occurredAt: number;
    settled: boolean;
    fromAccountId: number;
    toAccountId: number;
    amount: number;
    description: string | null;
  } | null {
    this.submitAttempted.set(true);
    this.form.markAllAsTouched();

    if (this.hasValidationError()) {
      this.errorKey.set(invalidFormErrorKey);
      return null;
    }

    const values = this.form.getRawValue();

    const occurredAt = this.toOccurredAt(values.occurredAt);
    if (occurredAt === null) {
      this.errorKey.set('transactions.transfers.dialog.add.errors.dateRequired');
      return null;
    }

    const fromAccountId = this.toPositiveInteger(values.fromAccountId);
    if (fromAccountId === null) {
      this.errorKey.set('transactions.transfers.dialog.add.errors.fromAccountRequired');
      return null;
    }

    const toAccountId = this.toPositiveInteger(values.toAccountId);
    if (toAccountId === null) {
      this.errorKey.set('transactions.transfers.dialog.add.errors.toAccountRequired');
      return null;
    }

    if (fromAccountId === toAccountId) {
      this.errorKey.set('transactions.transfers.dialog.add.errors.accountsMustDiffer');
      return null;
    }

    const amount = this.toAmount(values.amount);
    if (amount === null) {
      this.errorKey.set('transactions.transfers.dialog.add.errors.amountInvalid');
      return null;
    }

    this.errorKey.set(null);
    return {
      occurredAt,
      settled: values.settled,
      fromAccountId,
      toAccountId,
      amount,
      description: this.toDescription(values.description),
    };
  }

  private hasValidationError(): boolean {
    return (
      this.getOccurredAtError(this.form.controls.occurredAt.value) !== null ||
      this.getFromAccountError(this.form.controls.fromAccountId.value) !== null ||
      this.getToAccountError(this.form.controls.toAccountId.value, this.form.controls.fromAccountId.value) !== null ||
      this.getAmountError(this.form.controls.amount.value) !== null ||
      this.getDescriptionError(this.form.controls.description.value) !== null
    );
  }

  private getOccurredAtError(value: Date | null): string | null {
    return this.toOccurredAt(value) === null ? 'transactions.transfers.dialog.add.errors.dateRequired' : null;
  }

  private getFromAccountError(value: unknown): string | null {
    return this.toPositiveInteger(value) === null ? 'transactions.transfers.dialog.add.errors.fromAccountRequired' : null;
  }

  private getToAccountError(value: unknown, fromAccountValue: unknown): string | null {
    const toAccountId = this.toPositiveInteger(value);
    if (toAccountId === null) {
      return 'transactions.transfers.dialog.add.errors.toAccountRequired';
    }

    const fromAccountId = this.toPositiveInteger(fromAccountValue);
    if (fromAccountId !== null && fromAccountId === toAccountId) {
      return 'transactions.transfers.dialog.add.errors.accountsMustDiffer';
    }

    return null;
  }

  private getAmountError(value: string): string | null {
    if (value.trim().length === 0) {
      return 'transactions.transfers.dialog.add.errors.amountRequired';
    }

    return this.toAmount(value) === null ? 'transactions.transfers.dialog.add.errors.amountInvalid' : null;
  }

  private getDescriptionError(value: string): string | null {
    return value.length > TRANSFER_DESCRIPTION_MAX_LENGTH
      ? 'transactions.transfers.dialog.add.errors.descriptionMaxLength'
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
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }

  private toDescription(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalizedValue = `${value}`.trim();
    return normalizedValue.length === 0 ? null : normalizedValue;
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
