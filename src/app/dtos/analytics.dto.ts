import type { AccountType } from './accounts.dto';
import type { CategoryType } from './categories.dto';
import type { BooleanFlagInput, RowId, UnixTimestampMilliseconds } from './common.dto';
import type { TransactionDto } from './transactions.dto';

export interface AnalyticsFiltersDto {
  readonly from?: UnixTimestampMilliseconds;
  readonly to?: UnixTimestampMilliseconds;
  readonly date_from?: UnixTimestampMilliseconds;
  readonly date_to?: UnixTimestampMilliseconds;
  readonly account_ids?: readonly RowId[];
  readonly account_types?: readonly AccountType[];
  readonly category_ids?: readonly RowId[];
  readonly category_types?: readonly CategoryType[];
  readonly settled?: BooleanFlagInput;
}

export interface AnalyticsFilterPayloadDto {
  readonly filters?: AnalyticsFiltersDto;
}

export type AnalyticsFilterPayload = AnalyticsFiltersDto | AnalyticsFilterPayloadDto;

export interface AnalyticsMonthlySummaryRowDto {
  readonly month: string;
  readonly expenses_cents: number;
  readonly incomes_cents: number;
  readonly net_cashflow_cents: number;
}

export interface AnalyticsMonthlySummaryResponseDto {
  readonly rows: readonly AnalyticsMonthlySummaryRowDto[];
}

export interface AnalyticsAvailableYearsResponseDto {
  readonly years: readonly number[];
}

export interface AnalyticsReceivablesPayablesTotalsDto {
  readonly receivables_cents: number;
  readonly payables_cents: number;
}

export interface AnalyticsReceivablesPayablesResponseDto {
  readonly receivables: readonly TransactionDto[];
  readonly payables: readonly TransactionDto[];
  readonly totals: AnalyticsReceivablesPayablesTotalsDto;
}

export interface AnalyticsNetWorthByAccountRowDto {
  readonly account_id: RowId;
  readonly account_name: string;
  readonly account_type: AccountType;
  readonly net_worth_cents: number;
  readonly net_worth_valued_cents?: number | null;
}

export interface AnalyticsNetWorthSnapshotsDto {
  readonly hasSnapshots: boolean;
  readonly latestSnapshotAtMs: UnixTimestampMilliseconds | null;
  readonly daysSinceLatestSnapshot: number | null;
  readonly isOutdated: boolean;
}

export interface AnalyticsNetWorthByAccountResponseDto {
  readonly rows: readonly AnalyticsNetWorthByAccountRowDto[];
  readonly totals?: {
    readonly current_total_cents: number;
    readonly previous_month_total_cents: number;
    readonly previous_month_delta_cents: number;
  };
  readonly netWorthCents: number;
  readonly netWorthMode: 'valued' | 'ledger';
  readonly netWorthLedgerCents: number;
  readonly netWorthValuedCents: number | null;
  readonly liquidAssetsCents: number;
  readonly investmentsCents: number;
  readonly snapshots: AnalyticsNetWorthSnapshotsDto;
}

export interface AnalyticsCategoryByMonthRowDto {
  readonly month: string;
  readonly category_id: RowId;
  readonly category_name: string;
  readonly category_type: CategoryType;
  readonly total_cents: number;
}

export interface AnalyticsCategoryByMonthResponseDto {
  readonly rows: readonly AnalyticsCategoryByMonthRowDto[];
}

export interface AnalyticsMoneyFlowSankeyTotalsDto {
  readonly incomes_cents: number;
  readonly expenses_cents: number;
  readonly savings_cents: number;
  readonly investments_cents: number;
  readonly crypto_cents: number;
  readonly net_cashflow_cents: number;
}

export interface AnalyticsMoneyFlowSankeyExpenseCategoryRowDto {
  readonly category_id: RowId | null;
  readonly category_name: string;
  readonly total_cents: number;
}

export interface AnalyticsMoneyFlowSankeyByMonthResponseDto {
  readonly totals: AnalyticsMoneyFlowSankeyTotalsDto;
  readonly expense_by_category: readonly AnalyticsMoneyFlowSankeyExpenseCategoryRowDto[];
  readonly expense_categories?: readonly AnalyticsMoneyFlowSankeyExpenseCategoryRowDto[];
}

export interface AnalyticsCompareMonthSelectionDto {
  readonly year: number;
  readonly month_index: number;
}

export interface AnalyticsCompareMonthPeriodDto extends AnalyticsCompareMonthSelectionDto {
  readonly month_key: string;
  readonly from: UnixTimestampMilliseconds;
  readonly to: UnixTimestampMilliseconds;
}

export interface AnalyticsCompareMonthCategoryRowDto {
  readonly category_id: RowId;
  readonly category_name: string;
  readonly amount_cents: number;
}

export interface AnalyticsCompareMonthDailyTotalsRowDto {
  readonly date: string;
  readonly expenses_cents: number;
  readonly incomes_cents: number;
  readonly net_cashflow_cents: number;
}

export interface AnalyticsCompareMonthSnapshotDto {
  readonly period: AnalyticsCompareMonthPeriodDto;
  readonly totals: AnalyticsMoneyFlowSankeyTotalsDto;
  readonly net_worth: AnalyticsNetWorthByAccountResponseDto;
  readonly expenses_by_category: readonly AnalyticsCompareMonthCategoryRowDto[];
  readonly incomes_by_category: readonly AnalyticsCompareMonthCategoryRowDto[];
  readonly daily_totals: readonly AnalyticsCompareMonthDailyTotalsRowDto[];
}

export interface AnalyticsCompareMonthsPayloadDto {
  readonly left: AnalyticsCompareMonthSelectionDto;
  readonly right: AnalyticsCompareMonthSelectionDto;
}

export interface AnalyticsCompareMonthsResponseDto {
  readonly left: AnalyticsCompareMonthSnapshotDto;
  readonly right: AnalyticsCompareMonthSnapshotDto;
}

export interface AnalyticsBudgetVsExpensesByCategoryByYearPayloadDto {
  readonly year: number;
}

export interface AnalyticsBudgetVsExpensesByCategoryByYearRowDto {
  readonly budget_id: RowId;
  readonly year: number;
  readonly category_id: RowId;
  readonly category_name: string;
  readonly budget_amount_cents: number;
  readonly expenses_total_cents: number;
  readonly delta_cents: number;
}

export interface AnalyticsBudgetVsExpensesByCategoryByYearResponseDto {
  readonly year: number;
  readonly rows: readonly AnalyticsBudgetVsExpensesByCategoryByYearRowDto[];
  readonly totals: {
    readonly budget_amount_cents: number;
    readonly expenses_total_cents: number;
    readonly delta_cents: number;
  };
}

export type AnalyticsExpensesIncomesNetCashflowByMonthResponse = AnalyticsMonthlySummaryResponseDto;
export type AnalyticsAvailableYearsResponse = AnalyticsAvailableYearsResponseDto;
export type AnalyticsReceivablesPayablesResponse = AnalyticsReceivablesPayablesResponseDto;
export type AnalyticsNetWorthByAccountResponse = AnalyticsNetWorthByAccountResponseDto;
export type AnalyticsExpensesByCategoryByMonthResponse = AnalyticsCategoryByMonthResponseDto;
export type AnalyticsIncomesByCategoryByMonthResponse = AnalyticsCategoryByMonthResponseDto;
export type AnalyticsMoneyFlowSankeyByMonthResponse = AnalyticsMoneyFlowSankeyByMonthResponseDto;
export type AnalyticsCompareMonthsPayload = AnalyticsCompareMonthsPayloadDto;
export type AnalyticsCompareMonthsResponse = AnalyticsCompareMonthsResponseDto;
export type AnalyticsBudgetVsExpensesByCategoryByYearPayload = AnalyticsBudgetVsExpensesByCategoryByYearPayloadDto;
export type AnalyticsBudgetVsExpensesByCategoryByYearResponse = AnalyticsBudgetVsExpensesByCategoryByYearResponseDto;
