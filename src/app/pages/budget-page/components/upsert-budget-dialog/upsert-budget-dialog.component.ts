import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import type { EditableOptionItem } from '@/components/data-table';
import type { BudgetCreateDto, BudgetUpdateDto } from '@/dtos';
import { amountToCents } from '@/models/common.model';
import { NumberFormatService } from '@/services/number-format.service';
import { ZardComboboxComponent, type ZardComboboxOption } from '@/shared/components/combobox';
import { Z_MODAL_DATA } from '@/shared/components/dialog';
import { ZardInputDirective } from '@/shared/components/input';

const BUDGET_DESCRIPTION_MAX_LENGTH = 75;

export interface BudgetDialogInitialValue {
  readonly categoryId: number;
  readonly amount: number;
  readonly description: string | null;
}

export interface UpsertBudgetDialogData {
  readonly categoryOptions: readonly EditableOptionItem[];
  readonly budget?: BudgetDialogInitialValue;
}

@Component({
  selector: 'app-upsert-budget-dialog',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    ZardComboboxComponent,
    ZardInputDirective,
  ],
  templateUrl: './upsert-budget-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpsertBudgetDialogComponent {
  protected readonly numberFormatService = inject(NumberFormatService);
  private readonly translateService = inject(TranslateService);
  private readonly data = inject<UpsertBudgetDialogData | null>(Z_MODAL_DATA, { optional: true });
  private readonly initialBudget = this.data?.budget;

  protected readonly categoryOptions: readonly ZardComboboxOption[] = this.toDialogOptions(this.data?.categoryOptions);
  protected readonly descriptionMaxLength = BUDGET_DESCRIPTION_MAX_LENGTH;

  protected readonly form = new FormGroup({
    categoryId: new FormControl<string | null>(
      this.initialBudget ? `${this.initialBudget.categoryId}` : null,
    ),
    amount: new FormControl(this.initialBudget ? `${this.initialBudget.amount}` : '', { nonNullable: true }),
    description: new FormControl(this.initialBudget?.description ?? '', { nonNullable: true }),
  });

  protected readonly submitAttempted = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.clearSubmitError();
    });
  }

  public collectCreatePayload(): BudgetCreateDto | null {
    const values = this.collectNormalizedValues('budgets.dialog.add.errors.fixValidation');
    if (!values) {
      return null;
    }

    return {
      category_id: values.categoryId,
      amount_cents: values.amountCents,
      description: values.description,
    };
  }

  public collectUpdateChanges(): BudgetUpdateDto['changes'] | null {
    const values = this.collectNormalizedValues('budgets.dialog.edit.errors.fixValidation');
    if (!values) {
      return null;
    }

    return {
      category_id: values.categoryId,
      amount_cents: values.amountCents,
      description: values.description,
    };
  }

  public setSubmitError(errorKey: string | null): void {
    this.errorKey.set(errorKey);
  }

  protected visibleCategoryErrorKey(): string | null {
    const control = this.form.controls.categoryId;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getCategoryError(control.value);
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

  private collectNormalizedValues(invalidFormErrorKey: string): {
    categoryId: number;
    amountCents: number;
    description: string | null;
  } | null {
    this.submitAttempted.set(true);
    this.form.markAllAsTouched();

    if (this.hasValidationError()) {
      this.errorKey.set(invalidFormErrorKey);
      return null;
    }

    const values = this.form.getRawValue();

    const categoryId = this.toPositiveInteger(values.categoryId);
    if (categoryId === null) {
      this.errorKey.set('budgets.dialog.add.errors.categoryRequired');
      return null;
    }

    const amountCents = this.toAmountCents(values.amount);
    if (amountCents === null) {
      this.errorKey.set('budgets.dialog.add.errors.amountInvalid');
      return null;
    }

    this.errorKey.set(null);
    return {
      categoryId,
      amountCents,
      description: this.normalizeNullableString(values.description),
    };
  }

  private hasValidationError(): boolean {
    return (
      this.getCategoryError(this.form.controls.categoryId.value) !== null ||
      this.getAmountError(this.form.controls.amount.value) !== null ||
      this.getDescriptionError(this.form.controls.description.value) !== null
    );
  }

  private getCategoryError(value: unknown): string | null {
    return this.toPositiveInteger(value) === null ? 'budgets.dialog.add.errors.categoryRequired' : null;
  }

  private getAmountError(value: string): string | null {
    if (value.trim().length === 0) {
      return 'budgets.dialog.add.errors.amountRequired';
    }

    return this.toAmountCents(value) === null ? 'budgets.dialog.add.errors.amountInvalid' : null;
  }

  private getDescriptionError(value: string): string | null {
    return value.length > BUDGET_DESCRIPTION_MAX_LENGTH ? 'budgets.dialog.add.errors.descriptionMaxLength' : null;
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

  private toAmountCents(value: unknown): number | null {
    if (value === null || value === undefined || `${value}`.trim().length === 0) {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    const amountCents = amountToCents(parsed);
    return amountCents > 0 ? amountCents : null;
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
