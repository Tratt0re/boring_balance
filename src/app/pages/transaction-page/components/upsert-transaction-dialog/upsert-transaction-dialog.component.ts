import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { EditableOptionItem } from '@/components/data-table';
import type { TransactionCreateDto, TransactionUpdateDto } from '@/dtos';
import { ZardDatePickerComponent } from '@/shared/components/date-picker';
import { Z_MODAL_DATA } from '@/shared/components/dialog';
import { ZardInputDirective } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSwitchComponent } from '@/shared/components/switch';

interface DialogSelectOption {
  readonly value: string;
  readonly label: string;
}

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
  imports: [TranslatePipe, ZardDatePickerComponent, ZardInputDirective, ZardSwitchComponent, ...ZardSelectImports],
  templateUrl: './upsert-transaction-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpsertTransactionDialogComponent {
  private readonly data = inject<UpsertTransactionDialogData | null>(Z_MODAL_DATA, { optional: true });
  private readonly initialTransaction = this.data?.transaction;

  protected readonly accountOptions: readonly DialogSelectOption[] = this.toDialogOptions(this.data?.accountOptions);
  protected readonly categoryOptions: readonly DialogSelectOption[] = this.toDialogOptions(this.data?.categoryOptions);

  protected readonly occurredAt = signal<Date | null>(
    this.initialTransaction ? new Date(this.initialTransaction.occurredAt) : new Date(),
  );
  protected readonly settled = signal(this.initialTransaction?.settled ?? false);
  protected readonly accountId = signal(this.initialTransaction ? `${this.initialTransaction.accountId}` : '');
  protected readonly amount = signal(this.initialTransaction ? `${this.initialTransaction.amount}` : '');
  protected readonly categoryId = signal(this.initialTransaction ? `${this.initialTransaction.categoryId}` : '');
  protected readonly description = signal(this.initialTransaction?.description ?? '');

  protected readonly occurredAtTouched = signal(false);
  protected readonly accountIdTouched = signal(false);
  protected readonly amountTouched = signal(false);
  protected readonly categoryIdTouched = signal(false);
  protected readonly descriptionTouched = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected readonly occurredAtErrorKey = computed(() => this.getOccurredAtError(this.occurredAt()));
  protected readonly accountIdErrorKey = computed(() => this.getAccountIdError(this.accountId()));
  protected readonly amountErrorKey = computed(() => this.getAmountError(this.amount()));
  protected readonly categoryIdErrorKey = computed(() => this.getCategoryIdError(this.categoryId()));
  protected readonly descriptionErrorKey = computed(() => this.getDescriptionError(this.description()));

  protected readonly visibleOccurredAtErrorKey = computed(() =>
    this.submitAttempted() || this.occurredAtTouched() ? this.occurredAtErrorKey() : null,
  );
  protected readonly visibleAccountIdErrorKey = computed(() =>
    this.submitAttempted() || this.accountIdTouched() ? this.accountIdErrorKey() : null,
  );
  protected readonly visibleAmountErrorKey = computed(() =>
    this.submitAttempted() || this.amountTouched() ? this.amountErrorKey() : null,
  );
  protected readonly visibleCategoryIdErrorKey = computed(() =>
    this.submitAttempted() || this.categoryIdTouched() ? this.categoryIdErrorKey() : null,
  );
  protected readonly visibleDescriptionErrorKey = computed(() =>
    this.submitAttempted() || this.descriptionTouched() ? this.descriptionErrorKey() : null,
  );

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

  protected onOccurredAtChange(value: Date | null): void {
    this.occurredAt.set(value);
    this.occurredAtTouched.set(true);
    this.clearSubmitError();
  }

  protected onSettledChange(checked: boolean): void {
    this.settled.set(checked);
    this.clearSubmitError();
  }

  protected onAccountIdChange(value: string | string[]): void {
    if (Array.isArray(value)) {
      return;
    }

    this.accountId.set(value);
    this.accountIdTouched.set(true);
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

  protected onCategoryIdChange(value: string | string[]): void {
    if (Array.isArray(value)) {
      return;
    }

    this.categoryId.set(value);
    this.categoryIdTouched.set(true);
    this.clearSubmitError();
  }

  protected onDescriptionInput(event: Event): void {
    const value = (event.target as HTMLInputElement | null)?.value ?? '';
    this.description.set(value);
    this.clearSubmitError();
  }

  protected onDescriptionBlur(): void {
    this.descriptionTouched.set(true);
  }

  private hasValidationError(): boolean {
    return (
      this.occurredAtErrorKey() !== null ||
      this.accountIdErrorKey() !== null ||
      this.amountErrorKey() !== null ||
      this.categoryIdErrorKey() !== null ||
      this.descriptionErrorKey() !== null
    );
  }

  private collectNormalizedValues(invalidFormErrorKey: string): NormalizedTransactionValues | null {
    this.submitAttempted.set(true);
    this.occurredAtTouched.set(true);
    this.accountIdTouched.set(true);
    this.amountTouched.set(true);
    this.categoryIdTouched.set(true);
    this.descriptionTouched.set(true);

    if (this.hasValidationError()) {
      this.errorKey.set(invalidFormErrorKey);
      return null;
    }

    const occurredAt = this.toOccurredAt(this.occurredAt());
    if (occurredAt === null) {
      this.errorKey.set('transactions.dialog.add.errors.dateRequired');
      return null;
    }

    const accountId = this.toPositiveInteger(this.accountId());
    if (accountId === null) {
      this.errorKey.set('transactions.dialog.add.errors.accountRequired');
      return null;
    }

    const amount = this.toAmount(this.amount());
    if (amount === null) {
      this.errorKey.set('transactions.dialog.add.errors.amountInvalid');
      return null;
    }

    const categoryId = this.toPositiveInteger(this.categoryId());
    if (categoryId === null) {
      this.errorKey.set('transactions.dialog.add.errors.categoryRequired');
      return null;
    }

    this.errorKey.set(null);
    return {
      occurredAt,
      settled: this.settled(),
      accountId,
      amount,
      categoryId,
      description: this.normalizeNullableString(this.description()),
    };
  }

  private getOccurredAtError(value: Date | null): string | null {
    return this.toOccurredAt(value) === null ? 'transactions.dialog.add.errors.dateRequired' : null;
  }

  private getAccountIdError(value: string): string | null {
    return this.toPositiveInteger(value) === null ? 'transactions.dialog.add.errors.accountRequired' : null;
  }

  private getAmountError(value: string): string | null {
    if (value.trim().length === 0) {
      return 'transactions.dialog.add.errors.amountRequired';
    }

    return this.toAmount(value) === null ? 'transactions.dialog.add.errors.amountInvalid' : null;
  }

  private getCategoryIdError(value: string): string | null {
    return this.toPositiveInteger(value) === null ? 'transactions.dialog.add.errors.categoryRequired' : null;
  }

  private getDescriptionError(value: string): string | null {
    return value.trim().length > 160 ? 'transactions.dialog.add.errors.descriptionMaxLength' : null;
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

  private toDialogOptions(options: readonly EditableOptionItem[] | undefined): readonly DialogSelectOption[] {
    return (options ?? []).map((option) => ({
      value: `${option.value}`,
      label: option.label,
    }));
  }
}
