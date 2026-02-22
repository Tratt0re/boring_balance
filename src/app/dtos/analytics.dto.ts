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
}

export interface AnalyticsNetWorthByAccountResponseDto {
  readonly rows: readonly AnalyticsNetWorthByAccountRowDto[];
  readonly totals?: {
    readonly current_total_cents: number;
    readonly previous_month_total_cents: number;
    readonly previous_month_delta_cents: number;
  };
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

export type AnalyticsExpensesIncomesNetCashflowByMonthResponse = AnalyticsMonthlySummaryResponseDto;
export type AnalyticsReceivablesPayablesResponse = AnalyticsReceivablesPayablesResponseDto;
export type AnalyticsNetWorthByAccountResponse = AnalyticsNetWorthByAccountResponseDto;
export type AnalyticsExpensesByCategoryByMonthResponse = AnalyticsCategoryByMonthResponseDto;
export type AnalyticsIncomesByCategoryByMonthResponse = AnalyticsCategoryByMonthResponseDto;
export type AnalyticsMoneyFlowSankeyByMonthResponse = AnalyticsMoneyFlowSankeyByMonthResponseDto;
