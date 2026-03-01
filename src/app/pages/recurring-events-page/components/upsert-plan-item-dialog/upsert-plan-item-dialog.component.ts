import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import type { EditableOptionItem } from '@/components/data-table';
import type {
  PlanItemCreateDto,
  PlanItemFrequencyUnit,
  PlanItemMonthPolicy,
  PlanItemRuleJsonDto,
  PlanItemTransactionTemplateJsonInputDto,
  PlanItemTransferTemplateJsonInputDto,
  PlanItemType,
  PlanItemUpdateDto,
} from '@/dtos';
import { amountToCents } from '@/models';
import { NumberFormatService } from '@/services/number-format.service';
import { ZardComboboxComponent, type ZardComboboxOption } from '@/shared/components/combobox';
import { ZardDatePickerComponent } from '@/shared/components/date-picker';
import { Z_MODAL_DATA } from '@/shared/components/dialog';
import { ZardInputDirective } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSwitchComponent } from '@/shared/components/switch';

const PLAN_ITEM_TITLE_MIN_LENGTH = 2;
const PLAN_ITEM_TITLE_MAX_LENGTH = 80;
const PLAN_ITEM_DESCRIPTION_MAX_LENGTH = 75;

const PLAN_ITEM_TYPE_OPTIONS = [
  { label: 'recurringEvents.type.transaction', value: 'transaction' },
  { label: 'recurringEvents.type.transfer', value: 'transfer' },
] as const;

const PLAN_ITEM_FREQUENCY_UNIT_OPTIONS = [
  { label: 'recurringEvents.frequency.unit.day', value: 'day' },
  { label: 'recurringEvents.frequency.unit.week', value: 'week' },
  { label: 'recurringEvents.frequency.unit.month', value: 'month' },
  { label: 'recurringEvents.frequency.unit.year', value: 'year' },
] as const;

const PLAN_ITEM_MONTH_POLICY_OPTIONS = [
  { label: 'recurringEvents.monthPolicy.none', value: '' },
  { label: 'recurringEvents.monthPolicy.clip', value: 'clip' },
  { label: 'recurringEvents.monthPolicy.skip', value: 'skip' },
  { label: 'recurringEvents.monthPolicy.last_day', value: 'last_day' },
  { label: 'recurringEvents.monthPolicy.first_day', value: 'first_day' },
] as const;

interface NormalizedPlanItemValues {
  readonly title: string;
  readonly type: PlanItemType;
  readonly ruleJson: PlanItemRuleJsonDto;
  readonly template: {
    readonly amountCents: number;
    readonly description: string;
    readonly settled: boolean;
    readonly accountId?: number;
    readonly categoryId?: number;
    readonly fromAccountId?: number;
    readonly toAccountId?: number;
  };
}

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
  protected readonly descriptionMaxLength = PLAN_ITEM_DESCRIPTION_MAX_LENGTH;
  protected readonly accountOptions: readonly ZardComboboxOption[] = this.toDialogOptions(this.data?.accountOptions);
  protected readonly categoryOptions: readonly ZardComboboxOption[] = this.toDialogOptions(this.data?.categoryOptions);

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
        account_id: values.template.accountId!,
        category_id: values.template.categoryId!,
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
      from_account_id: values.template.fromAccountId!,
      to_account_id: values.template.toAccountId!,
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

  public collectUpdateChanges(): PlanItemUpdateDto['changes'] | null {
    const values = this.collectNormalizedValues('recurringEvents.dialog.edit.errors.fixValidation');
    if (!values) {
      return null;
    }

    if (values.type === 'transaction') {
      const templateJson: PlanItemTransactionTemplateJsonInputDto = {
        amount_cents: values.template.amountCents,
        account_id: values.template.accountId!,
        category_id: values.template.categoryId!,
        description: values.template.description,
        settled: values.template.settled,
      };

      return {
        title: values.title,
        rule_json: values.ruleJson,
        template_json: templateJson,
      };
    }

    const templateJson: PlanItemTransferTemplateJsonInputDto = {
      amount_cents: values.template.amountCents,
      from_account_id: values.template.fromAccountId!,
      to_account_id: values.template.toAccountId!,
      description: values.template.description,
      settled: values.template.settled,
    };

    return {
      title: values.title,
      rule_json: values.ruleJson,
      template_json: templateJson,
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

    return this.getTitleError(control.value);
  }

  protected visibleTypeErrorKey(): string | null {
    const control = this.form.controls.type;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getTypeError(control.value);
  }

  protected visibleStartDateErrorKey(): string | null {
    const control = this.form.controls.startDate;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getStartDateError(control.value);
  }

  protected visibleCountErrorKey(): string | null {
    const control = this.form.controls.count;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getCountError(control.value);
  }

  protected visibleFrequencyIntervalErrorKey(): string | null {
    const control = this.form.controls.frequencyInterval;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getFrequencyIntervalError(control.value);
  }

  protected visibleFrequencyUnitErrorKey(): string | null {
    const control = this.form.controls.frequencyUnit;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getFrequencyUnitError(control.value);
  }

  protected visibleAmountErrorKey(): string | null {
    const control = this.form.controls.amount;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getAmountError(control.value);
  }

  protected visibleAccountIdErrorKey(): string | null {
    if (!this.isTransactionTypeSelected()) {
      return null;
    }

    const control = this.form.controls.accountId;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getAccountIdError(control.value);
  }

  protected visibleCategoryIdErrorKey(): string | null {
    if (!this.isTransactionTypeSelected()) {
      return null;
    }

    const control = this.form.controls.categoryId;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getCategoryIdError(control.value);
  }

  protected visibleFromAccountErrorKey(): string | null {
    if (!this.isTransferTypeSelected()) {
      return null;
    }

    const control = this.form.controls.fromAccountId;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getFromAccountError(control.value);
  }

  protected visibleToAccountErrorKey(): string | null {
    if (!this.isTransferTypeSelected()) {
      return null;
    }

    const control = this.form.controls.toAccountId;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getToAccountError(control.value, this.form.controls.fromAccountId.value);
  }

  protected visibleDescriptionErrorKey(): string | null {
    const control = this.form.controls.description;
    if (!this.submitAttempted() && !control.touched) {
      return null;
    }

    return this.getDescriptionError(control.value);
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

    const title = this.normalizeRequiredString(values.title);
    if (!title) {
      this.errorKey.set('recurringEvents.dialog.add.errors.titleRequired');
      return null;
    }

    const type = this.toPlanItemType(values.type);
    if (!type) {
      this.errorKey.set('recurringEvents.dialog.add.errors.typeRequired');
      return null;
    }

    const startDate = this.toTimestamp(values.startDate);
    if (startDate === null) {
      this.errorKey.set('recurringEvents.dialog.add.errors.startDateRequired');
      return null;
    }

    const count = this.toPositiveInteger(values.count);
    if (count === null) {
      this.errorKey.set('recurringEvents.dialog.add.errors.countInvalid');
      return null;
    }

    const frequencyInterval = this.toPositiveInteger(values.frequencyInterval);
    if (frequencyInterval === null) {
      this.errorKey.set('recurringEvents.dialog.add.errors.frequencyIntervalInvalid');
      return null;
    }

    const frequencyUnit = this.toPlanItemFrequencyUnit(values.frequencyUnit);
    if (!frequencyUnit) {
      this.errorKey.set('recurringEvents.dialog.add.errors.frequencyUnitRequired');
      return null;
    }

    const amount = this.toAmountForType(values.amount, type);
    if (amount === null) {
      this.errorKey.set('recurringEvents.dialog.add.errors.amountInvalid');
      return null;
    }

    const monthPolicy = this.toPlanItemMonthPolicy(values.monthPolicy);

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
      description: this.normalizeTemplateDescription(values.description) || title.slice(0, PLAN_ITEM_DESCRIPTION_MAX_LENGTH),
      settled: values.settled,
    } as const;

    if (type === 'transaction') {
      const accountId = this.toPositiveInteger(values.accountId);
      if (accountId === null) {
        this.errorKey.set('recurringEvents.dialog.add.errors.accountRequired');
        return null;
      }

      const categoryId = this.toPositiveInteger(values.categoryId);
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

    const fromAccountId = this.toPositiveInteger(values.fromAccountId);
    if (fromAccountId === null) {
      this.errorKey.set('recurringEvents.dialog.add.errors.fromAccountRequired');
      return null;
    }

    const toAccountId = this.toPositiveInteger(values.toAccountId);
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
      this.getTitleError(this.form.controls.title.value) !== null ||
      this.getTypeError(this.form.controls.type.value) !== null ||
      this.getStartDateError(this.form.controls.startDate.value) !== null ||
      this.getCountError(this.form.controls.count.value) !== null ||
      this.getFrequencyIntervalError(this.form.controls.frequencyInterval.value) !== null ||
      this.getFrequencyUnitError(this.form.controls.frequencyUnit.value) !== null ||
      this.getAmountError(this.form.controls.amount.value) !== null ||
      this.getDescriptionError(this.form.controls.description.value) !== null
    ) {
      return true;
    }

    if (this.isTransactionTypeSelected()) {
      return (
        this.getAccountIdError(this.form.controls.accountId.value) !== null ||
        this.getCategoryIdError(this.form.controls.categoryId.value) !== null
      );
    }

    if (this.isTransferTypeSelected()) {
      return (
        this.getFromAccountError(this.form.controls.fromAccountId.value) !== null ||
        this.getToAccountError(this.form.controls.toAccountId.value, this.form.controls.fromAccountId.value) !== null
      );
    }

    return false;
  }

  private getTitleError(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return 'recurringEvents.dialog.add.errors.titleRequired';
    }

    if (trimmed.length < PLAN_ITEM_TITLE_MIN_LENGTH) {
      return 'recurringEvents.dialog.add.errors.titleMinLength';
    }

    if (trimmed.length > PLAN_ITEM_TITLE_MAX_LENGTH) {
      return 'recurringEvents.dialog.add.errors.titleMaxLength';
    }

    return null;
  }

  private getTypeError(value: unknown): string | null {
    return this.toPlanItemType(value) === null ? 'recurringEvents.dialog.add.errors.typeRequired' : null;
  }

  private getStartDateError(value: Date | null): string | null {
    return this.toTimestamp(value) === null ? 'recurringEvents.dialog.add.errors.startDateRequired' : null;
  }

  private getCountError(value: string): string | null {
    if (value.trim().length === 0) {
      return 'recurringEvents.dialog.add.errors.countRequired';
    }

    return this.toPositiveInteger(value) === null ? 'recurringEvents.dialog.add.errors.countInvalid' : null;
  }

  private getFrequencyIntervalError(value: string): string | null {
    if (value.trim().length === 0) {
      return 'recurringEvents.dialog.add.errors.frequencyIntervalRequired';
    }

    return this.toPositiveInteger(value) === null ? 'recurringEvents.dialog.add.errors.frequencyIntervalInvalid' : null;
  }

  private getFrequencyUnitError(value: unknown): string | null {
    return this.toPlanItemFrequencyUnit(value) === null
      ? 'recurringEvents.dialog.add.errors.frequencyUnitRequired'
      : null;
  }

  private getAccountIdError(value: unknown): string | null {
    return this.toPositiveInteger(value) === null ? 'recurringEvents.dialog.add.errors.accountRequired' : null;
  }

  private getCategoryIdError(value: unknown): string | null {
    return this.toPositiveInteger(value) === null ? 'recurringEvents.dialog.add.errors.categoryRequired' : null;
  }

  private getFromAccountError(value: unknown): string | null {
    return this.toPositiveInteger(value) === null ? 'recurringEvents.dialog.add.errors.fromAccountRequired' : null;
  }

  private getToAccountError(value: unknown, fromAccountValue: unknown): string | null {
    const toAccountId = this.toPositiveInteger(value);
    if (toAccountId === null) {
      return 'recurringEvents.dialog.add.errors.toAccountRequired';
    }

    const fromAccountId = this.toPositiveInteger(fromAccountValue);
    if (fromAccountId !== null && fromAccountId === toAccountId) {
      return 'recurringEvents.dialog.add.errors.accountsMustDiffer';
    }

    return null;
  }

  private getAmountError(value: string): string | null {
    if (value.trim().length === 0) {
      return 'recurringEvents.dialog.add.errors.amountRequired';
    }

    const type = this.toPlanItemType(this.form.controls.type.value);
    if (!type) {
      return 'recurringEvents.dialog.add.errors.amountInvalid';
    }

    return this.toAmountForType(value, type) === null ? 'recurringEvents.dialog.add.errors.amountInvalid' : null;
  }

  private getDescriptionError(value: string): string | null {
    return value.length > PLAN_ITEM_DESCRIPTION_MAX_LENGTH
      ? 'recurringEvents.dialog.add.errors.descriptionMaxLength'
      : null;
  }

  private normalizeRequiredString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = `${value}`.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeTemplateDescription(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    return `${value}`.trim();
  }

  private toTimestamp(value: Date | null): number | null {
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

  private toPositiveAmount(value: unknown): number | null {
    if (value === null || value === undefined || `${value}`.trim().length === 0) {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }

  private toSignedNonZeroAmount(value: unknown): number | null {
    if (value === null || value === undefined || `${value}`.trim().length === 0) {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed === 0) {
      return null;
    }

    return parsed;
  }

  private toAmountForType(value: unknown, type: PlanItemType): number | null {
    return type === 'transaction' ? this.toSignedNonZeroAmount(value) : this.toPositiveAmount(value);
  }

  private toPlanItemType(value: unknown): PlanItemType | null {
    return value === 'transaction' || value === 'transfer' ? value : null;
  }

  private toPlanItemFrequencyUnit(value: unknown): PlanItemFrequencyUnit | null {
    return value === 'day' || value === 'week' || value === 'month' || value === 'year' ? value : null;
  }

  private toPlanItemMonthPolicy(value: unknown): PlanItemMonthPolicy | null {
    return value === 'clip' || value === 'skip' || value === 'last_day' || value === 'first_day' ? value : null;
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
