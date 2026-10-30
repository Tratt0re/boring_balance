import type {
  PlanItemFrequencyUnit,
  PlanItemMonthPolicy,
  PlanItemRuleJsonDto,
  PlanItemType,
} from '@/dtos';
import { dateToUnixMs, toPositiveInteger } from '@/shared/utils/dialog-form-utils';

export const PLAN_ITEM_TITLE_MIN_LENGTH = 2;
export const PLAN_ITEM_TITLE_MAX_LENGTH = 80;
export const PLAN_ITEM_DESCRIPTION_MAX_LENGTH = 75;

export const PLAN_ITEM_TYPE_OPTIONS = [
  { label: 'recurringEvents.type.transaction', value: 'transaction' },
  { label: 'recurringEvents.type.transfer', value: 'transfer' },
] as const;

export const PLAN_ITEM_FREQUENCY_UNIT_OPTIONS = [
  { label: 'recurringEvents.frequency.unit.day', value: 'day' },
  { label: 'recurringEvents.frequency.unit.week', value: 'week' },
  { label: 'recurringEvents.frequency.unit.month', value: 'month' },
  { label: 'recurringEvents.frequency.unit.year', value: 'year' },
] as const;

export const PLAN_ITEM_MONTH_POLICY_OPTIONS = [
  { label: 'recurringEvents.monthPolicy.none', value: '' },
  { label: 'recurringEvents.monthPolicy.clip', value: 'clip' },
  { label: 'recurringEvents.monthPolicy.skip', value: 'skip' },
  { label: 'recurringEvents.monthPolicy.last_day', value: 'last_day' },
  { label: 'recurringEvents.monthPolicy.first_day', value: 'first_day' },
] as const;

export const PLAN_ITEM_LINKED_ITEMS_UPDATE_SCOPE_OPTIONS = [
  { label: 'recurringEvents.dialog.edit.applyToOptions.all', value: 'all' },
  { label: 'recurringEvents.dialog.edit.applyToOptions.upcoming', value: 'upcoming' },
  { label: 'recurringEvents.dialog.edit.applyToOptions.fromDate', value: 'from_date' },
  { label: 'recurringEvents.dialog.edit.applyToOptions.ruleOnly', value: 'rule_only' },
] as const;

export interface NormalizedPlanItemBase {
  readonly title: string;
  readonly ruleJson: PlanItemRuleJsonDto;
}

export interface NormalizedTemplateBase {
  readonly amountCents: number;
  readonly description: string;
  readonly settled: boolean;
}

export type NormalizedPlanItemValues =
  | (NormalizedPlanItemBase & {
      readonly type: 'transaction';
      readonly template: NormalizedTemplateBase & {
        readonly accountId: number;
        readonly categoryId: number;
      };
    })
  | (NormalizedPlanItemBase & {
      readonly type: 'transfer';
      readonly template: NormalizedTemplateBase & {
        readonly fromAccountId: number;
        readonly toAccountId: number;
      };
    });

export function getTitleError(value: string): string | null {
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

export function getTypeError(value: unknown): string | null {
  return toPlanItemType(value) === null ? 'recurringEvents.dialog.add.errors.typeRequired' : null;
}

export function getStartDateError(value: Date | null): string | null {
  return dateToUnixMs(value) === null
    ? 'recurringEvents.dialog.add.errors.startDateRequired'
    : null;
}

export function getCountError(value: string): string | null {
  if (value.trim().length === 0) {
    return 'recurringEvents.dialog.add.errors.countRequired';
  }

  return toPositiveInteger(value) === null
    ? 'recurringEvents.dialog.add.errors.countInvalid'
    : null;
}

export function getFrequencyIntervalError(value: string): string | null {
  if (value.trim().length === 0) {
    return 'recurringEvents.dialog.add.errors.frequencyIntervalRequired';
  }

  return toPositiveInteger(value) === null
    ? 'recurringEvents.dialog.add.errors.frequencyIntervalInvalid'
    : null;
}

export function getFrequencyUnitError(value: unknown): string | null {
  return toPlanItemFrequencyUnit(value) === null
    ? 'recurringEvents.dialog.add.errors.frequencyUnitRequired'
    : null;
}

export function getAccountIdError(value: unknown): string | null {
  return toPositiveInteger(value) === null
    ? 'recurringEvents.dialog.add.errors.accountRequired'
    : null;
}

export function getCategoryIdError(value: unknown): string | null {
  return toPositiveInteger(value) === null
    ? 'recurringEvents.dialog.add.errors.categoryRequired'
    : null;
}

export function getFromAccountError(value: unknown): string | null {
  return toPositiveInteger(value) === null
    ? 'recurringEvents.dialog.add.errors.fromAccountRequired'
    : null;
}

export function getToAccountError(value: unknown, fromAccountValue: unknown): string | null {
  const toAccountId = toPositiveInteger(value);
  if (toAccountId === null) {
    return 'recurringEvents.dialog.add.errors.toAccountRequired';
  }

  const fromAccountId = toPositiveInteger(fromAccountValue);
  if (fromAccountId !== null && fromAccountId === toAccountId) {
    return 'recurringEvents.dialog.add.errors.accountsMustDiffer';
  }

  return null;
}

export function getAmountError(value: string, typeValue: unknown): string | null {
  if (value.trim().length === 0) {
    return 'recurringEvents.dialog.add.errors.amountRequired';
  }

  const type = toPlanItemType(typeValue);
  if (!type) {
    return 'recurringEvents.dialog.add.errors.amountInvalid';
  }

  return toAmountForType(value, type) === null
    ? 'recurringEvents.dialog.add.errors.amountInvalid'
    : null;
}

export function getDescriptionError(value: string): string | null {
  return value.length > PLAN_ITEM_DESCRIPTION_MAX_LENGTH
    ? 'recurringEvents.dialog.add.errors.descriptionMaxLength'
    : null;
}

export function normalizeTemplateDescription(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return `${value}`.trim();
}

export function toPositiveAmount(value: unknown): number | null {
  if (value === null || value === undefined || `${value}`.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function toSignedNonZeroAmount(value: unknown): number | null {
  if (value === null || value === undefined || `${value}`.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) {
    return null;
  }

  return parsed;
}

export function toAmountForType(value: unknown, type: PlanItemType): number | null {
  return type === 'transaction' ? toSignedNonZeroAmount(value) : toPositiveAmount(value);
}

export function toPlanItemType(value: unknown): PlanItemType | null {
  return value === 'transaction' || value === 'transfer' ? value : null;
}

export function toPlanItemFrequencyUnit(value: unknown): PlanItemFrequencyUnit | null {
  return value === 'day' || value === 'week' || value === 'month' || value === 'year'
    ? value
    : null;
}

export function toPlanItemMonthPolicy(value: unknown): PlanItemMonthPolicy | null {
  return value === 'clip' || value === 'skip' || value === 'last_day' || value === 'first_day'
    ? value
    : null;
}
