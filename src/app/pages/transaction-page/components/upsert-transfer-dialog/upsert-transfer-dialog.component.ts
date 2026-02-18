import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { EditableOptionItem } from '@/components/data-table';
import type { TransactionCreateTransferDto, TransactionUpdateTransferDto } from '@/dtos';
import { ZardDatePickerComponent } from '@/shared/components/date-picker';
import { Z_MODAL_DATA } from '@/shared/components/dialog';
import { ZardInputDirective } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';

interface DialogSelectOption {
  readonly value: string;
  readonly label: string;
}

export interface TransferDialogInitialValue {
  readonly transferId: string;
  readonly occurredAt: number;
  readonly fromAccountId: number;
  readonly toAccountId: number;
  readonly amount: number;
}

export interface UpsertTransferDialogData {
  readonly accountOptions: readonly EditableOptionItem[];
  readonly transfer?: TransferDialogInitialValue;
}

@Component({
  selector: 'app-upsert-transfer-dialog',
  imports: [TranslatePipe, ZardDatePickerComponent, ZardInputDirective, ...ZardSelectImports],
  templateUrl: './upsert-transfer-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpsertTransferDialogComponent {
  private readonly data = inject<UpsertTransferDialogData | null>(Z_MODAL_DATA, { optional: true });
  private readonly initialTransfer = this.data?.transfer;

  protected readonly accountOptions: readonly DialogSelectOption[] = this.toDialogOptions(this.data?.accountOptions);

  protected readonly occurredAt = signal<Date | null>(
    this.initialTransfer ? new Date(this.initialTransfer.occurredAt) : new Date(),
  );
  protected readonly fromAccountId = signal(this.initialTransfer ? `${this.initialTransfer.fromAccountId}` : '');
  protected readonly toAccountId = signal(this.initialTransfer ? `${this.initialTransfer.toAccountId}` : '');
  protected readonly amount = signal(this.initialTransfer ? `${this.initialTransfer.amount}` : '');

  protected readonly occurredAtTouched = signal(false);
  protected readonly fromAccountTouched = signal(false);
  protected readonly toAccountTouched = signal(false);
  protected readonly amountTouched = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected readonly occurredAtErrorKey = computed(() => this.getOccurredAtError(this.occurredAt()));
  protected readonly fromAccountErrorKey = computed(() => this.getFromAccountError(this.fromAccountId()));
  protected readonly toAccountErrorKey = computed(() => this.getToAccountError(this.toAccountId(), this.fromAccountId()));
  protected readonly amountErrorKey = computed(() => this.getAmountError(this.amount()));

  protected readonly visibleOccurredAtErrorKey = computed(() =>
    this.submitAttempted() || this.occurredAtTouched() ? this.occurredAtErrorKey() : null,
  );
  protected readonly visibleFromAccountErrorKey = computed(() =>
    this.submitAttempted() || this.fromAccountTouched() ? this.fromAccountErrorKey() : null,
  );
  protected readonly visibleToAccountErrorKey = computed(() =>
    this.submitAttempted() || this.toAccountTouched() ? this.toAccountErrorKey() : null,
  );
  protected readonly visibleAmountErrorKey = computed(() =>
    this.submitAttempted() || this.amountTouched() ? this.amountErrorKey() : null,
  );

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
    };
  }

  public setSubmitError(errorKey: string | null): void {
    this.errorKey.set(errorKey);
  }

  protected onOccurredAtChange(value: Date | null): void {
    this.occurredAt.set(value);
    this.occurredAtTouched.set(true);
    this.clearSubmitError();
  }

  protected onFromAccountChange(value: string | string[]): void {
    if (Array.isArray(value)) {
      return;
    }

    this.fromAccountId.set(value);
    this.fromAccountTouched.set(true);
    this.clearSubmitError();
  }

  protected onToAccountChange(value: string | string[]): void {
    if (Array.isArray(value)) {
      return;
    }

    this.toAccountId.set(value);
    this.toAccountTouched.set(true);
    this.clearSubmitError();
  }

  protected onAmountInput(event: Event): void {
    const value = (event.target as HTMLInputElement | null)?.value ?? '';
    this.amount.set(value);
    this.clearSubmitError();
  }

  protected onAmountBlur(): void {
    this.amountTouched.set(true);
  }

  protected isFromAccountOptionDisabled(optionValue: string): boolean {
    const selectedToAccountId = this.toAccountId();
    return selectedToAccountId.length > 0 && selectedToAccountId === optionValue;
  }

  protected isToAccountOptionDisabled(optionValue: string): boolean {
    const selectedFromAccountId = this.fromAccountId();
    return selectedFromAccountId.length > 0 && selectedFromAccountId === optionValue;
  }

  private collectNormalizedValues(invalidFormErrorKey: string): {
    occurredAt: number;
    fromAccountId: number;
    toAccountId: number;
    amount: number;
  } | null {
    this.submitAttempted.set(true);
    this.occurredAtTouched.set(true);
    this.fromAccountTouched.set(true);
    this.toAccountTouched.set(true);
    this.amountTouched.set(true);

    if (this.hasValidationError()) {
      this.errorKey.set(invalidFormErrorKey);
      return null;
    }

    const occurredAt = this.toOccurredAt(this.occurredAt());
    if (occurredAt === null) {
      this.errorKey.set('transactions.transfers.dialog.add.errors.dateRequired');
      return null;
    }

    const fromAccountId = this.toPositiveInteger(this.fromAccountId());
    if (fromAccountId === null) {
      this.errorKey.set('transactions.transfers.dialog.add.errors.fromAccountRequired');
      return null;
    }

    const toAccountId = this.toPositiveInteger(this.toAccountId());
    if (toAccountId === null) {
      this.errorKey.set('transactions.transfers.dialog.add.errors.toAccountRequired');
      return null;
    }

    if (fromAccountId === toAccountId) {
      this.errorKey.set('transactions.transfers.dialog.add.errors.accountsMustDiffer');
      return null;
    }

    const amount = this.toAmount(this.amount());
    if (amount === null) {
      this.errorKey.set('transactions.transfers.dialog.add.errors.amountInvalid');
      return null;
    }

    this.errorKey.set(null);
    return {
      occurredAt,
      fromAccountId,
      toAccountId,
      amount,
    };
  }

  private hasValidationError(): boolean {
    return (
      this.occurredAtErrorKey() !== null ||
      this.fromAccountErrorKey() !== null ||
      this.toAccountErrorKey() !== null ||
      this.amountErrorKey() !== null
    );
  }

  private getOccurredAtError(value: Date | null): string | null {
    return this.toOccurredAt(value) === null ? 'transactions.transfers.dialog.add.errors.dateRequired' : null;
  }

  private getFromAccountError(value: string): string | null {
    return this.toPositiveInteger(value) === null ? 'transactions.transfers.dialog.add.errors.fromAccountRequired' : null;
  }

  private getToAccountError(value: string, fromAccountValue: string): string | null {
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

  private clearSubmitError(): void {
    if (this.errorKey()) {
      this.errorKey.set(null);
    }
  }

  private toDialogOptions(options: readonly EditableOptionItem[] | undefined): readonly DialogSelectOption[] {
    return (options ?? []).map((option) => ({
      value: `${option.value}`,
      label: option.label,
    }));
  }
}
