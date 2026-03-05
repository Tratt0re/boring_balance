import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import type { AccountValuationCreateDto, AccountValuationUpdateDto } from '@/dtos';
import { amountToCents, centsToAmount } from '@/models/common.model';
import { NumberFormatService } from '@/services/number-format.service';
import { Z_MODAL_DATA } from '@/shared/components/dialog';
import { ZardDatePickerComponent } from '@/shared/components/date-picker';
import { ZardInputDirective } from '@/shared/components/input';

export interface AccountValuationDialogInitialValue {
  readonly valuedAt: number;
  readonly valueCents: number;
}

export interface UpsertAccountValuationDialogData {
  readonly accountId: number;
  readonly valuation?: AccountValuationDialogInitialValue;
}

@Component({
  selector: 'app-upsert-account-valuation-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, ZardInputDirective, ZardDatePickerComponent],
  templateUrl: './upsert-account-valuation-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpsertAccountValuationDialogComponent {
  protected readonly numberFormatService = inject(NumberFormatService);
  private readonly data = inject<UpsertAccountValuationDialogData | null>(Z_MODAL_DATA, { optional: true });
  private readonly initialValuation = this.data?.valuation;

  protected readonly form = new FormGroup({
    value: new FormControl(
      this.initialValuation ? `${centsToAmount(this.initialValuation.valueCents)}` : '',
      { nonNullable: true },
    ),
    date: new FormControl<Date | null>(
      this.initialValuation ? new Date(this.initialValuation.valuedAt) : new Date(),
    ),
  });

  protected readonly submitAttempted = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.clearSubmitError();
    });
  }

  public collectCreatePayload(): AccountValuationCreateDto | null {
    const values = this.collectNormalizedValues('accountValuations.dialog.add.errors.fixValidation');
    if (!values) {
      return null;
    }

    const accountId = this.data?.accountId;
    if (!accountId) {
      this.errorKey.set('accountValuations.dialog.add.errors.createFailed');
      return null;
    }

    return {
      account_id: accountId,
      valued_at: values.valuedAt,
      value_cents: values.valueCents,
      source: 'manual',
    };
  }

  public collectUpdateChanges(): AccountValuationUpdateDto['changes'] | null {
    const values = this.collectNormalizedValues('accountValuations.dialog.edit.errors.fixValidation');
    if (!values) {
      return null;
    }

    return {
      valued_at: values.valuedAt,
      value_cents: values.valueCents,
    };
  }

  public setSubmitError(errorKey: string | null): void {
    this.errorKey.set(errorKey);
  }

  protected visibleValueErrorKey(): string | null {
    const control = this.form.controls.value;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getValueError(control.value);
  }

  protected visibleDateErrorKey(): string | null {
    const control = this.form.controls.date;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getDateError(control.value);
  }

  private collectNormalizedValues(invalidFormErrorKey: string): {
    valuedAt: number;
    valueCents: number;
  } | null {
    this.submitAttempted.set(true);
    this.form.markAllAsTouched();

    if (this.hasValidationError()) {
      this.errorKey.set(invalidFormErrorKey);
      return null;
    }

    const raw = this.form.getRawValue();

    const valueCents = this.toValueCents(raw.value);
    if (valueCents === null) {
      this.errorKey.set('accountValuations.dialog.add.errors.valueInvalid');
      return null;
    }

    const valuedAt = this.toUnixMs(raw.date);
    if (valuedAt === null) {
      this.errorKey.set('accountValuations.dialog.add.errors.dateRequired');
      return null;
    }

    this.errorKey.set(null);
    return { valuedAt, valueCents };
  }

  private hasValidationError(): boolean {
    return (
      this.getValueError(this.form.controls.value.value) !== null ||
      this.getDateError(this.form.controls.date.value) !== null
    );
  }

  private getValueError(value: string): string | null {
    if (value.trim().length === 0) {
      return 'accountValuations.dialog.add.errors.valueRequired';
    }

    return this.toValueCents(value) === null ? 'accountValuations.dialog.add.errors.valueInvalid' : null;
  }

  private getDateError(value: Date | null): string | null {
    return value === null ? 'accountValuations.dialog.add.errors.dateRequired' : null;
  }

  private toValueCents(value: unknown): number | null {
    if (value === null || value === undefined || `${value}`.trim().length === 0) {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }

    return amountToCents(parsed);
  }

  private toUnixMs(date: Date | null): number | null {
    if (!date || !(date instanceof Date) || !Number.isFinite(date.getTime())) {
      return null;
    }

    return date.getTime();
  }

  private clearSubmitError(): void {
    if (this.errorKey()) {
      this.errorKey.set(null);
    }
  }
}
