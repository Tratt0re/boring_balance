import type * as DTO from '@/dtos';

type IpcRequest<TPayload, TResult> = (payload: TPayload) => Promise<TResult>;
type OptionalIpcRequest<TPayload, TResult> = (payload?: TPayload) => Promise<TResult>;

export enum APIChannel {
  APP_META = 'appMeta',
  ACCOUNTS = 'accounts',
  CATEGORIES = 'categories',
  ANALYTICS = 'analytics',
  TRANSACTIONS = 'transactions',
}

export interface ElectronIpcClient {
  readonly appMeta: {
    readonly create: IpcRequest<DTO.AppMetaCreateDto, DTO.AppMetaCreateResponse>;
    readonly get: IpcRequest<DTO.AppMetaGetDto, DTO.AppMetaGetResponse>;
    readonly list: OptionalIpcRequest<DTO.AppMetaListDto, DTO.AppMetaListResponse>;
    readonly update: IpcRequest<DTO.AppMetaUpdateDto, DTO.AppMetaUpdateResponse>;
    readonly remove: IpcRequest<DTO.AppMetaGetDto, DTO.AppMetaRemoveResponse>;
    readonly upsert: IpcRequest<DTO.AppMetaUpsertDto, DTO.AppMetaUpsertResponse>;
  };
  readonly accounts: {
    readonly create: IpcRequest<DTO.AccountCreateDto, DTO.AccountCreateResponse>;
    readonly get: IpcRequest<DTO.AccountGetDto, DTO.AccountGetResponse>;
    readonly list: OptionalIpcRequest<DTO.AccountListDto, DTO.AccountListResponse>;
    readonly update: IpcRequest<DTO.AccountUpdateDto, DTO.AccountUpdateResponse>;
    readonly remove: IpcRequest<DTO.AccountRemoveDto, DTO.AccountRemoveResponse>;
  };
  readonly categories: {
    readonly create: IpcRequest<DTO.CategoryCreateDto, DTO.CategoryCreateResponse>;
    readonly get: IpcRequest<DTO.CategoryGetDto, DTO.CategoryGetResponse>;
    readonly list: OptionalIpcRequest<DTO.CategoryListDto, DTO.CategoryListResponse>;
    readonly update: IpcRequest<DTO.CategoryUpdateDto, DTO.CategoryUpdateResponse>;
    readonly remove: IpcRequest<DTO.CategoryRemoveDto, DTO.CategoryRemoveResponse>;
  };
  readonly analytics: {
    readonly expensesIncomesNetCashflowByMonth: OptionalIpcRequest<
      DTO.AnalyticsFilterPayload,
      DTO.AnalyticsExpensesIncomesNetCashflowByMonthResponse
    >;
    readonly receivablesPayables: OptionalIpcRequest<
      DTO.AnalyticsFilterPayload,
      DTO.AnalyticsReceivablesPayablesResponse
    >;
    readonly netWorthByAccount: OptionalIpcRequest<DTO.AnalyticsFilterPayload, DTO.AnalyticsNetWorthByAccountResponse>;
    readonly expensesByCategoryByMonth: OptionalIpcRequest<
      DTO.AnalyticsFilterPayload,
      DTO.AnalyticsExpensesByCategoryByMonthResponse
    >;
    readonly incomesByCategoryByMonth: OptionalIpcRequest<
      DTO.AnalyticsFilterPayload,
      DTO.AnalyticsIncomesByCategoryByMonthResponse
    >;
    readonly moneyFlowSankeyByMonth: OptionalIpcRequest<
      DTO.AnalyticsFilterPayload,
      DTO.AnalyticsMoneyFlowSankeyByMonthResponse
    >;
  };
  readonly transactions: {
    readonly create: IpcRequest<DTO.TransactionCreateDto, DTO.TransactionCreateResponse>;
    readonly createTransfer: IpcRequest<DTO.TransactionCreateTransferDto, DTO.TransactionCreateTransferResponse>;
    readonly updateTransfer: IpcRequest<DTO.TransactionUpdateTransferDto, DTO.TransactionUpdateTransferResponse>;
    readonly deleteTransfer: IpcRequest<DTO.TransactionDeleteTransferDto, DTO.TransactionDeleteTransferResponse>;
    readonly get: IpcRequest<DTO.TransactionGetDto, DTO.TransactionGetResponse>;
    readonly listTransactions: OptionalIpcRequest<
      DTO.TransactionListTransactionsDto,
      DTO.TransactionListTransactionsResponse
    >;
    readonly listTransfers: OptionalIpcRequest<DTO.TransactionListTransfersDto, DTO.TransactionListTransfersResponse>;
    readonly update: IpcRequest<DTO.TransactionUpdateDto, DTO.TransactionUpdateResponse>;
    readonly remove: IpcRequest<DTO.TransactionRemoveDto, DTO.TransactionRemoveResponse>;
  };
}

export interface ElectronAPI {
  readonly ipcClient: ElectronIpcClient;
  readonly platform: string;
  readonly versions: Readonly<{
    chrome: string;
    electron: string;
    node: string;
  }>;
}

declare global {
  interface Window {
    readonly electronAPI?: ElectronAPI;
  }
}

export {};
