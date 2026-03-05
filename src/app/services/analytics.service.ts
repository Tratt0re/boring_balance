import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';

import { BaseIpcService } from './base-ipc.service';

const LIQUID_ACCOUNT_TYPES = new Set(['cash', 'bank', 'savings']);
const INVESTMENT_ACCOUNT_TYPES = new Set(['brokerage', 'crypto']);

@Injectable({
  providedIn: 'root',
})
export class AnalyticsService extends BaseIpcService<APIChannel.ANALYTICS> {
  constructor() {
    super(APIChannel.ANALYTICS);
  }

  expensesIncomesNetCashflowByMonth(
    payload?: DTO.AnalyticsFilterPayload,
  ): Promise<DTO.AnalyticsExpensesIncomesNetCashflowByMonthResponse> {
    return this.ipcClient.expensesIncomesNetCashflowByMonth(payload);
  }

  budgetVsExpensesByCategoryByYear(
    payload: DTO.AnalyticsBudgetVsExpensesByCategoryByYearPayload,
  ): Promise<DTO.AnalyticsBudgetVsExpensesByCategoryByYearResponse> {
    return this.ipcClient.budgetVsExpensesByCategoryByYear(payload);
  }

  compareMonths(payload: DTO.AnalyticsCompareMonthsPayload): Promise<DTO.AnalyticsCompareMonthsResponse> {
    return this.ipcClient.compareMonths(payload);
  }

  receivablesPayables(payload?: DTO.AnalyticsFilterPayload): Promise<DTO.AnalyticsReceivablesPayablesResponse> {
    return this.ipcClient.receivablesPayables(payload);
  }

  async netWorthByAccount(payload?: DTO.AnalyticsFilterPayload): Promise<DTO.AnalyticsNetWorthByAccountResponse> {
    const response = await this.ipcClient.netWorthByAccount(payload);
    const rows = Array.isArray(response?.rows)
      ? response.rows.map((row) => ({
          ...row,
          net_worth_cents: this.normalizeFiniteNumber(row?.net_worth_cents),
          net_worth_valued_cents: this.normalizeNullableFiniteNumber(row?.net_worth_valued_cents),
        }))
      : [];
    const fallbackLedgerCents = rows.reduce((total, row) => total + Number(row?.net_worth_cents ?? 0), 0);
    const netWorthLedgerCents = this.normalizeFiniteNumber(response?.netWorthLedgerCents, fallbackLedgerCents);
    const netWorthValuedCents = this.normalizeNullableFiniteNumber(response?.netWorthValuedCents);
    const netWorthMode = response?.netWorthMode === 'valued' || response?.netWorthMode === 'ledger'
      ? response.netWorthMode
      : (netWorthValuedCents === null ? 'ledger' : 'valued');
    const netWorthCentsFallback = netWorthMode === 'valued'
      ? (netWorthValuedCents ?? netWorthLedgerCents)
      : netWorthLedgerCents;
    const netWorthCents = this.normalizeFiniteNumber(response?.netWorthCents, netWorthCentsFallback);
    const liquidAssetsFallbackCents = this.sumNetWorthRowsByAccountTypes(rows, LIQUID_ACCOUNT_TYPES, netWorthMode);
    const investmentsFallbackCents = this.sumNetWorthRowsByAccountTypes(rows, INVESTMENT_ACCOUNT_TYPES, netWorthMode);
    const liquidAssetsCents = this.normalizeFiniteNumber(response?.liquidAssetsCents, liquidAssetsFallbackCents);
    const investmentsCents = this.normalizeFiniteNumber(response?.investmentsCents, investmentsFallbackCents);
    const snapshots = response?.snapshots;

    return {
      ...response,
      rows,
      netWorthCents,
      netWorthMode,
      netWorthLedgerCents,
      netWorthValuedCents,
      liquidAssetsCents,
      investmentsCents,
      snapshots: {
        hasSnapshots: snapshots?.hasSnapshots === true,
        latestSnapshotAtMs: this.normalizeNullableFiniteNumber(snapshots?.latestSnapshotAtMs),
        daysSinceLatestSnapshot: this.normalizeNullableFiniteNumber(snapshots?.daysSinceLatestSnapshot),
        isOutdated: snapshots?.isOutdated === true,
      },
    };
  }

  expensesByCategoryByMonth(
    payload?: DTO.AnalyticsFilterPayload,
  ): Promise<DTO.AnalyticsExpensesByCategoryByMonthResponse> {
    return this.ipcClient.expensesByCategoryByMonth(payload);
  }

  incomesByCategoryByMonth(
    payload?: DTO.AnalyticsFilterPayload,
  ): Promise<DTO.AnalyticsIncomesByCategoryByMonthResponse> {
    return this.ipcClient.incomesByCategoryByMonth(payload);
  }

  moneyFlowSankeyByMonth(payload?: DTO.AnalyticsFilterPayload): Promise<DTO.AnalyticsMoneyFlowSankeyByMonthResponse> {
    return this.ipcClient.moneyFlowSankeyByMonth(payload);
  }

  async availableYears(payload?: DTO.AnalyticsFilterPayload): Promise<readonly number[]> {
    const response = await this.ipcClient.availableYears(payload);
    const years = Array.isArray(response?.years) ? response.years : [];

    return years
      .map((year) => Number(year))
      .filter((year) => Number.isInteger(year))
      .sort((left, right) => right - left);
  }

  private normalizeFiniteNumber(value: unknown, fallback = 0): number {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
      return Number.isFinite(fallback) ? fallback : 0;
    }

    return normalized;
  }

  private normalizeNullableFiniteNumber(value: unknown): number | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }

  private sumNetWorthRowsByAccountTypes(
    rows: readonly DTO.AnalyticsNetWorthByAccountRowDto[],
    accountTypes: ReadonlySet<string>,
    netWorthMode: 'valued' | 'ledger',
  ): number {
    return rows.reduce((totalCents, row) => {
      if (!accountTypes.has(String(row?.account_type ?? ''))) {
        return totalCents;
      }

      const ledgerCents = this.normalizeFiniteNumber(row?.net_worth_cents);
      const valuedCents = this.normalizeNullableFiniteNumber(row?.net_worth_valued_cents);
      const effectiveCents = netWorthMode === 'valued' && valuedCents !== null
        ? valuedCents
        : ledgerCents;

      return totalCents + effectiveCents;
    }, 0);
  }
}
