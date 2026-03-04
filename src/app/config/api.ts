import type * as DTO from '@/dtos';

type IpcRequest<TPayload, TResult> = (payload: TPayload) => Promise<TResult>;
type OptionalIpcRequest<TPayload, TResult> = (payload?: TPayload) => Promise<TResult>;
type IpcEventListener<TPayload = unknown> = (payload: TPayload) => void;

export interface ElectronAppInfo {
  readonly name: string | null;
  readonly version: string | null;
  readonly author: string | null;
  readonly repositoryUrl: string | null;
}

export enum APIChannel {
  APP_META = 'appMeta',
  ACCOUNT_VALUATIONS = 'accountValuations',
  ACCOUNTS = 'accounts',
  CATEGORIES = 'categories',
  BUDGETS = 'budgets',
  ANALYTICS = 'analytics',
  PLAN_ITEMS = 'planItems',
  TRANSACTIONS = 'transactions',
  BACKUP = 'backup',
  DATA_EXPORT = 'dataExport',
  IMPORT_EXCEL = 'importExcel',
  SYNC = 'sync',
}

export interface ElectronIpcClient {
  readonly accountValuations: {
    readonly create: IpcRequest<DTO.AccountValuationCreateDto, DTO.AccountValuationCreateResponse>;
    readonly get: IpcRequest<DTO.AccountValuationGetDto, DTO.AccountValuationGetResponse>;
    readonly list: OptionalIpcRequest<DTO.AccountValuationListDto, DTO.AccountValuationListResponse>;
    readonly update: IpcRequest<DTO.AccountValuationUpdateDto, DTO.AccountValuationUpdateResponse>;
    readonly remove: IpcRequest<DTO.AccountValuationRemoveDto, DTO.AccountValuationRemoveResponse>;
    readonly getLatestByAccount: IpcRequest<
      DTO.AccountValuationGetLatestByAccountDto,
      DTO.AccountValuationGetLatestByAccountResponse
    >;
  };
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
  readonly budgets: {
    readonly create: IpcRequest<DTO.BudgetCreateDto, DTO.BudgetCreateResponse>;
    readonly get: IpcRequest<DTO.BudgetGetDto, DTO.BudgetGetResponse>;
    readonly list: OptionalIpcRequest<DTO.BudgetListDto, DTO.BudgetListResponse>;
    readonly update: IpcRequest<DTO.BudgetUpdateDto, DTO.BudgetUpdateResponse>;
    readonly remove: IpcRequest<DTO.BudgetRemoveDto, DTO.BudgetRemoveResponse>;
  };
  readonly analytics: {
    readonly availableYears: OptionalIpcRequest<DTO.AnalyticsFilterPayload, DTO.AnalyticsAvailableYearsResponse>;
    readonly budgetVsExpensesByCategoryByYear: IpcRequest<
      DTO.AnalyticsBudgetVsExpensesByCategoryByYearPayload,
      DTO.AnalyticsBudgetVsExpensesByCategoryByYearResponse
    >;
    readonly compareMonths: IpcRequest<DTO.AnalyticsCompareMonthsPayload, DTO.AnalyticsCompareMonthsResponse>;
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
  readonly planItems: {
    readonly create: IpcRequest<DTO.PlanItemCreateDto, DTO.PlanItemCreateResponse>;
    readonly get: IpcRequest<DTO.PlanItemGetDto, DTO.PlanItemGetResponse>;
    readonly list: OptionalIpcRequest<DTO.PlanItemListDto, DTO.PlanItemListResponse>;
    readonly update: IpcRequest<DTO.PlanItemUpdateDto, DTO.PlanItemUpdateResponse>;
    readonly remove: IpcRequest<DTO.PlanItemRemoveDto, DTO.PlanItemRemoveResponse>;
    readonly run: IpcRequest<DTO.PlanItemRunDto, DTO.PlanItemRunResponse>;
    readonly deletePlannedItems: IpcRequest<
      DTO.PlanItemDeletePlannedItemsDto,
      DTO.PlanItemDeletePlannedItemsResponse
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
  readonly backup: {
    readonly getSettings: OptionalIpcRequest<void, DTO.BackupGetSettingsResponse>;
    readonly updateSettings: IpcRequest<DTO.BackupUpdateSettingsDto, DTO.BackupUpdateSettingsResponse>;
    readonly getState: OptionalIpcRequest<void, DTO.BackupGetStateResponse>;
    readonly selectFolder: OptionalIpcRequest<void, DTO.BackupSelectFolderResponse>;
    readonly list: OptionalIpcRequest<void, DTO.BackupListResponse>;
    readonly runNow: OptionalIpcRequest<void, DTO.BackupRunNowResponse>;
    readonly remove: IpcRequest<DTO.BackupRemoveDto, DTO.BackupRemoveResponse>;
    readonly restore: IpcRequest<DTO.BackupRestoreDto, DTO.BackupRestoreResponse>;
  };
  readonly dataExport: {
    readonly exportXlsx: OptionalIpcRequest<void, DTO.ExportXlsxResponse>;
    readonly downloadImportTemplate: OptionalIpcRequest<void, DTO.DownloadImportTemplateResponse>;
  };
  readonly importExcel: {
    readonly selectFile: OptionalIpcRequest<void, DTO.ImportExcelSelectFileResponse>;
    readonly validate: IpcRequest<DTO.ImportExcelValidateDto, DTO.ImportExcelValidateResponse>;
    readonly commit: IpcRequest<DTO.ImportExcelCommitDto, DTO.ImportExcelCommitResponse>;
  };
  readonly sync: {
    readonly getSettings: OptionalIpcRequest<void, DTO.SyncGetSettingsResponse>;
    readonly updateSettings: IpcRequest<DTO.SyncUpdateSettingsDto, DTO.SyncUpdateSettingsResponse>;
    readonly getState: OptionalIpcRequest<void, DTO.SyncGetStateResponse>;
    readonly selectFolder: OptionalIpcRequest<void, DTO.SyncSelectFolderResponse>;
    readonly enable: IpcRequest<DTO.SyncEnableDto, DTO.SyncEnableResponse>;
    readonly repoStatus: OptionalIpcRequest<DTO.SyncRepoStatusRequestDto, DTO.SyncRepoStatusResponse>;
    readonly enableCreateRepo: IpcRequest<DTO.SyncEnableCreateRepoDto, DTO.SyncEnableCreateRepoResponse>;
    readonly enableAttachRepo: IpcRequest<DTO.SyncEnableAttachRepoDto, DTO.SyncEnableAttachRepoResponse>;
    readonly disable: OptionalIpcRequest<void, DTO.SyncDisableResponse>;
    readonly syncNow: OptionalIpcRequest<void, DTO.SyncRunNowResponse>;
    readonly pullNow: OptionalIpcRequest<void, DTO.SyncPullNowResponse>;
    readonly pushNow: OptionalIpcRequest<void, DTO.SyncPushNowResponse>;
    readonly listSnapshots: OptionalIpcRequest<void, DTO.SyncListSnapshotsResponse>;
  };
}

export interface ElectronAPI {
  readonly ipcClient: ElectronIpcClient;
  readonly onIpcEvent?: (channel: string, listener: IpcEventListener) => void;
  readonly offIpcEvent?: (channel: string, listener: IpcEventListener) => void;
  readonly appInfo: ElectronAppInfo;
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
