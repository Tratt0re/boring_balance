import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import type { EditableOptionItem } from '@/components/data-table';
import type {
  PlanItemCreateDto,
  PlanItemFrequencyUnit,
  PlanItemLinkedItemsUpdateScope,
  PlanItemMonthPolicy,
  PlanItemRuleJsonDto,
  PlanItemTransactionTemplateJsonInputDto,
  PlanItemTransferTemplateJsonInputDto,
  PlanItemType,
  PlanItemUpdateDto,
} from '@/dtos';
import { amountToCents } from '@/models';
import { NumberFormatService } from '@/services/number-format.service';
import { dateToUnixMs, editableOptionsToCombobox, normalizeRequiredString, toPositiveInteger } from '@/shared/utils/dialog-form-utils';
import { ZardComboboxComponent, type ZardComboboxOption } from '@/shared/components/combobox';
import { ZardDatePickerComponent } from '@/shared/components/date-picker';
import { Z_MODAL_DATA } from '@/shared/components/dialog';
import { ZardInputDirective } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSwitchComponent } from '@/shared/components/switch';
import {
  NormalizedPlanItemValues,
  PLAN_ITEM_DESCRIPTION_MAX_LENGTH,
  PLAN_ITEM_FREQUENCY_UNIT_OPTIONS,
  PLAN_ITEM_LINKED_ITEMS_UPDATE_SCOPE_OPTIONS,
  PLAN_ITEM_MONTH_POLICY_OPTIONS,
  PLAN_ITEM_TYPE_OPTIONS,
  getAccountIdError,
  getAmountError,
  getCategoryIdError,
  getCountError,
  getDescriptionError,
  getFrequencyIntervalError,
  getFrequencyUnitError,
  getFromAccountError,
  getStartDateError,
  getTitleError,
  getToAccountError,
  getTypeError,
  normalizeTemplateDescription,
  toAmountForType,
  toPlanItemFrequencyUnit,
  toPlanItemMonthPolicy,
  toPlanItemType,
} from './upsert-plan-item-dialog.utils';

export interface PlanItemDialogInitialValue {
  readonly title: string;
  readonly type: PlanItemType;
  readonly startDate: number;
  readonly count: number;
  readonly frequencyUnit: PlanItemFrequencyUnit;
  readonly frequencyInterval: number;
  readonly monthPolicy: PlanItemMonthPolicy | null;
  readonly settled: boolean;
  readonly amount: number;
  readonly description: string | null;
  readonly accountId?: number;
  readonly categoryId?: number;
  readonly fromAccountId?: number;
  readonly toAccountId?: number;
}

export interface UpsertPlanItemDialogData {
  readonly accountOptions: readonly EditableOptionItem[];
  readonly categoryOptions: readonly EditableOptionItem[];
  readonly planItem?: PlanItemDialogInitialValue;
}

@Component({
  selector: 'app-upsert-plan-item-dialog',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    ZardComboboxComponent,
    ZardDatePickerComponent,
    ZardInputDirective,
    ZardSwitchComponent,
    ...ZardSelectImports,
  ],
  templateUrl: './upsert-plan-item-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpsertPlanItemDialogComponent {
  protected readonly numberFormatService = inject(NumberFormatService);
  private readonly translateService = inject(TranslateService);
  private readonly data = inject<UpsertPlanItemDialogData | null>(Z_MODAL_DATA, { optional: true });
  private readonly initialPlanItem = this.data?.planItem;
  protected readonly isEditMode = this.initialPlanItem !== undefined;

  protected readonly typeOptions = PLAN_ITEM_TYPE_OPTIONS;
  protected readonly frequencyUnitOptions = PLAN_ITEM_FREQUENCY_UNIT_OPTIONS;
  protected readonly monthPolicyOptions = PLAN_ITEM_MONTH_POLICY_OPTIONS;
  protected readonly linkedItemsUpdateScopeOptions = PLAN_ITEM_LINKED_ITEMS_UPDATE_SCOPE_OPTIONS;
  protected readonly descriptionMaxLength = PLAN_ITEM_DESCRIPTION_MAX_LENGTH;
  protected readonly accountOptions: readonly ZardComboboxOption[] = editableOptionsToCombobox(this.data?.accountOptions, this.translateService);
  protected readonly categoryOptions: readonly ZardComboboxOption[] = editableOptionsToCombobox(this.data?.categoryOptions, this.translateService);

  protected readonly form = new FormGroup({
    title: new FormControl(this.initialPlanItem?.title ?? '', { nonNullable: true }),
    type: new FormControl<PlanItemType | ''>(this.initialPlanItem?.type ?? 'transaction', { nonNullable: true }),
    startDate: new FormControl<Date | null>(
      {
        value: this.initialPlanItem ? new Date(this.initialPlanItem.startDate) : new Date(),
        disabled: this.isEditMode,
      },
    ),
    count: new FormControl(
      {
        value: this.initialPlanItem ? `${this.initialPlanItem.count}` : '12',
        disabled: this.isEditMode,
      },
      { nonNullable: true },
    ),
    frequencyInterval: new FormControl(
      {
        value: this.initialPlanItem ? `${this.initialPlanItem.frequencyInterval}` : '1',
        disabled: this.isEditMode,
      },
      { nonNullable: true },
    ),
    frequencyUnit: new FormControl<PlanItemFrequencyUnit | ''>(
      {
        value: this.initialPlanItem?.frequencyUnit ?? 'month',
        disabled: this.isEditMode,
      },
      { nonNullable: true },
    ),
    monthPolicy: new FormControl<PlanItemMonthPolicy | ''>(
      {
        value: this.initialPlanItem?.monthPolicy ?? 'clip',
        disabled: this.isEditMode,
      },
      {
        nonNullable: true,
      },
    ),
    settled: new FormControl(this.initialPlanItem?.settled ?? false, { nonNullable: true }),
    accountId: new FormControl<string | null>(this.initialPlanItem?.accountId ? `${this.initialPlanItem.accountId}` : null),
    categoryId: new FormControl<string | null>(
      this.initialPlanItem?.categoryId ? `${this.initialPlanItem.categoryId}` : null,
    ),
    fromAccountId: new FormControl<string | null>(
      this.initialPlanItem?.fromAccountId ? `${this.initialPlanItem.fromAccountId}` : null,
    ),
    toAccountId: new FormControl<string | null>(
      this.initialPlanItem?.toAccountId ? `${this.initialPlanItem.toAccountId}` : null,
    ),
    amount: new FormControl(this.initialPlanItem ? `${this.initialPlanItem.amount}` : '', { nonNullable: true }),
    description: new FormControl(this.initialPlanItem?.description ?? '', { nonNullable: true }),
    linkedItemsUpdateScope: new FormControl<PlanItemLinkedItemsUpdateScope>('upcoming', { nonNullable: true }),
    linkedItemsFromDate: new FormControl<Date | null>(new Date(new Date().setHours(0, 0, 0, 0))),
  });

  protected readonly submitAttempted = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.clearSubmitError();
    });
  }

  public collectCreatePayload(): PlanItemCreateDto | null {
    const values = this.collectNormalizedValues('recurringEvents.dialog.add.errors.fixValidation');
    if (!values) {
      return null;
    }

    if (values.type === 'transaction') {
      const templateJson: PlanItemTransactionTemplateJsonInputDto = {
        amount_cents: values.template.amountCents,
        account_id: values.template.accountId,
        category_id: values.template.categoryId,
        description: values.template.description,
        settled: values.template.settled,
      };

      return {
        title: values.title,
        type: 'transaction',
        rule_json: values.ruleJson,
        template_json: templateJson,
      };
    }

    const templateJson: PlanItemTransferTemplateJsonInputDto = {
      amount_cents: values.template.amountCents,
      from_account_id: values.template.fromAccountId,
      to_account_id: values.template.toAccountId,
      description: values.template.description,
      settled: values.template.settled,
    };

    return {
      title: values.title,
      type: 'transfer',
      rule_json: values.ruleJson,
      template_json: templateJson,
    };
  }

  public collectUpdatePayload(): Omit<PlanItemUpdateDto, 'id'> | null {
    const values = this.collectNormalizedValues('recurringEvents.dialog.edit.errors.fixValidation');
    if (!values) {
      return null;
    }

    const linkedItemsUpdateScope = this.form.controls.linkedItemsUpdateScope.value;
    const linkedItemsFromDate = dateToUnixMs(this.form.controls.linkedItemsFromDate.value);
    if (linkedItemsUpdateScope === 'from_date' && linkedItemsFromDate === null) {
      this.errorKey.set('recurringEvents.dialog.edit.errors.fromDateRequired');
      return null;
    }

    const linkedItems =
      linkedItemsUpdateScope === 'from_date'
        ? { scope: linkedItemsUpdateScope, from_date: linkedItemsFromDate! }
        : { scope: linkedItemsUpdateScope };

    if (values.type === 'transaction') {
      const templateJson: PlanItemTransactionTemplateJsonInputDto = {
        amount_cents: values.template.amountCents,
        account_id: values.template.accountId,
        category_id: values.template.categoryId,
        description: values.template.description,
        settled: values.template.settled,
      };
      const hasTemplateChanges =
        !this.initialPlanItem ||
        this.initialPlanItem.type !== values.type ||
        amountToCents(this.initialPlanItem.amount) !== templateJson.amount_cents ||
        this.initialPlanItem.accountId !== templateJson.account_id ||
        this.initialPlanItem.categoryId !== templateJson.category_id ||
        (this.initialPlanItem.description ?? '') !== templateJson.description ||
        this.initialPlanItem.settled !== templateJson.settled;

      return {
        changes: {
          title: values.title,
          ...(hasTemplateChanges ? { template_json: templateJson } : {}),
        },
        linked_items: linkedItems,
      };
    }

    const templateJson: PlanItemTransferTemplateJsonInputDto = {
      amount_cents: values.template.amountCents,
      from_account_id: values.template.fromAccountId,
      to_account_id: values.template.toAccountId,
      description: values.template.description,
      settled: values.template.settled,
    };
    const hasTemplateChanges =
      !this.initialPlanItem ||
      this.initialPlanItem.type !== values.type ||
      amountToCents(this.initialPlanItem.amount) !== templateJson.amount_cents ||
      this.initialPlanItem.fromAccountId !== templateJson.from_account_id ||
      this.initialPlanItem.toAccountId !== templateJson.to_account_id ||
      (this.initialPlanItem.description ?? '') !== templateJson.description ||
      this.initialPlanItem.settled !== templateJson.settled;

    return {
      changes: {
        title: values.title,
        ...(hasTemplateChanges ? { template_json: templateJson } : {}),
      },
      linked_items: linkedItems,
    };
  }

  public setSubmitError(errorKey: string | null): void {
    this.errorKey.set(errorKey);
  }

  protected visibleTitleErrorKey(): string | null {
    const control = this.form.controls.title;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return getTitleError(control.value);
  }

  protected visibleTypeErrorKey(): string | null {
    const control = this.form.controls.type;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return getTypeError(control.value);
  }

  protected visibleStartDateErrorKey(): string | null {
    const control = this.form.controls.startDate;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return getStartDateError(control.value);
  }

  protected visibleCountErrorKey(): string | null {
    const control = this.form.controls.count;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return getCountError(control.value);
  }

  protected visibleFrequencyIntervalErrorKey(): string | null {
    const control = this.form.controls.frequencyInterval;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return getFrequencyIntervalError(control.value);
  }

  protected visibleFrequencyUnitErrorKey(): string | null {
    const control = this.form.controls.frequencyUnit;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return getFrequencyUnitError(control.value);
  }

  protected visibleAmountErrorKey(): string | null {
    const control = this.form.controls.amount;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return getAmountError(control.value, this.form.controls.type.value);
  }

  protected visibleAccountIdErrorKey(): string | null {
    if (!this.isTransactionTypeSelected()) {
      return null;
    }

    const control = this.form.controls.accountId;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return getAccountIdError(control.value);
  }

  protected visibleCategoryIdErrorKey(): string | null {
    if (!this.isTransactionTypeSelected()) {
      return null;
    }

    const control = this.form.controls.categoryId;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return getCategoryIdError(control.value);
  }

  protected visibleFromAccountErrorKey(): string | null {
    if (!this.isTransferTypeSelected()) {
      return null;
    }

    const control = this.form.controls.fromAccountId;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return getFromAccountError(control.value);
  }

  protected visibleToAccountErrorKey(): string | null {
    if (!this.isTransferTypeSelected()) {
      return null;
    }

    const control = this.form.controls.toAccountId;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return getToAccountError(control.value, this.form.controls.fromAccountId.value);
  }

  protected visibleDescriptionErrorKey(): string | null {
    const control = this.form.controls.description;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return getDescriptionError(control.value);
  }

  protected isTransactionTypeSelected(): boolean {
    return this.form.controls.type.value === 'transaction';
  }

  protected isTransferTypeSelected(): boolean {
    return this.form.controls.type.value === 'transfer';
  }

  protected settledValue(): boolean {
    return this.form.controls.settled.value;
  }

  protected descriptionLength(): number {
    return this.form.controls.description.value.length;
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

  private collectNormalizedValues(invalidFormErrorKey: string): NormalizedPlanItemValues | null {
    this.submitAttempted.set(true);
    this.form.markAllAsTouched();

    if (this.hasValidationError()) {
      this.errorKey.set(invalidFormErrorKey);
      return null;
    }

    const values = this.form.getRawValue();

    const title = normalizeRequiredString(values.title);
    if (!title) {
      this.errorKey.set('recurringEvents.dialog.add.errors.titleRequired');
      return null;
    }

    const type = toPlanItemType(values.type);
    if (!type) {
      this.errorKey.set('recurringEvents.dialog.add.errors.typeRequired');
      return null;
    }

    const startDate = dateToUnixMs(values.startDate);
    if (startDate === null) {
      this.errorKey.set('recurringEvents.dialog.add.errors.startDateRequired');
      return null;
    }

    const count = toPositiveInteger(values.count);
    if (count === null) {
      this.errorKey.set('recurringEvents.dialog.add.errors.countInvalid');
      return null;
    }

    const frequencyInterval = toPositiveInteger(values.frequencyInterval);
    if (frequencyInterval === null) {
      this.errorKey.set('recurringEvents.dialog.add.errors.frequencyIntervalInvalid');
      return null;
    }

    const frequencyUnit = toPlanItemFrequencyUnit(values.frequencyUnit);
    if (!frequencyUnit) {
      this.errorKey.set('recurringEvents.dialog.add.errors.frequencyUnitRequired');
      return null;
    }

    const amount = toAmountForType(values.amount, type);
    if (amount === null) {
      this.errorKey.set('recurringEvents.dialog.add.errors.amountInvalid');
      return null;
    }

    const monthPolicy = toPlanItemMonthPolicy(values.monthPolicy);

    const ruleJson: PlanItemRuleJsonDto = {
      start_date: startDate,
      count,
      frequency: {
        unit: frequencyUnit,
        interval: frequencyInterval,
      },
      ...(monthPolicy ? { month_policy: monthPolicy } : {}),
    };

    const baseTemplate = {
      amountCents: amountToCents(amount),
      description: normalizeTemplateDescription(values.description) || title.slice(0, PLAN_ITEM_DESCRIPTION_MAX_LENGTH),
      settled: values.settled,
    } as const;

    if (type === 'transaction') {
      const accountId = toPositiveInteger(values.accountId);
      if (accountId === null) {
        this.errorKey.set('recurringEvents.dialog.add.errors.accountRequired');
        return null;
      }

      const categoryId = toPositiveInteger(values.categoryId);
      if (categoryId === null) {
        this.errorKey.set('recurringEvents.dialog.add.errors.categoryRequired');
        return null;
      }

      this.errorKey.set(null);
      return {
        title,
        type,
        ruleJson,
        template: {
          ...baseTemplate,
          accountId,
          categoryId,
        },
      };
    }

    const fromAccountId = toPositiveInteger(values.fromAccountId);
    if (fromAccountId === null) {
      this.errorKey.set('recurringEvents.dialog.add.errors.fromAccountRequired');
      return null;
    }

    const toAccountId = toPositiveInteger(values.toAccountId);
    if (toAccountId === null) {
      this.errorKey.set('recurringEvents.dialog.add.errors.toAccountRequired');
      return null;
    }

    if (fromAccountId === toAccountId) {
      this.errorKey.set('recurringEvents.dialog.add.errors.accountsMustDiffer');
      return null;
    }

    this.errorKey.set(null);
    return {
      title,
      type,
      ruleJson,
      template: {
        ...baseTemplate,
        fromAccountId,
        toAccountId,
      },
    };
  }

  private hasValidationError(): boolean {
    if (
      getTitleError(this.form.controls.title.value) !== null ||
      getTypeError(this.form.controls.type.value) !== null ||
      getStartDateError(this.form.controls.startDate.value) !== null ||
      getCountError(this.form.controls.count.value) !== null ||
      getFrequencyIntervalError(this.form.controls.frequencyInterval.value) !== null ||
      getFrequencyUnitError(this.form.controls.frequencyUnit.value) !== null ||
      getAmountError(this.form.controls.amount.value, this.form.controls.type.value) !== null ||
      getDescriptionError(this.form.controls.description.value) !== null
    ) {
      return true;
    }

    if (this.isTransactionTypeSelected()) {
      return (
        getAccountIdError(this.form.controls.accountId.value) !== null ||
        getCategoryIdError(this.form.controls.categoryId.value) !== null
      );
    }

    if (this.isTransferTypeSelected()) {
      return (
        getFromAccountError(this.form.controls.fromAccountId.value) !== null ||
        getToAccountError(this.form.controls.toAccountId.value, this.form.controls.fromAccountId.value) !== null
      );
    }

    return false;
  }

  private clearSubmitError(): void {
    if (this.errorKey()) {
      this.errorKey.set(null);
    }
  }
}
