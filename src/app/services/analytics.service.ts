import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';

import { BaseIpcService } from './base-ipc.service';

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

  netWorthByAccount(payload?: DTO.AnalyticsFilterPayload): Promise<DTO.AnalyticsNetWorthByAccountResponse> {
    return this.ipcClient.netWorthByAccount(payload);
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
}
