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
}
