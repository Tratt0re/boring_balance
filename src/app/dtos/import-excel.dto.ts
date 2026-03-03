export interface ImportExcelErrorDto {
  readonly sheet: string;
  readonly row: number;
  readonly column?: string;
  readonly code: string;
  readonly message: string;
}

export interface ImportExcelValidationSummaryDto {
  readonly accounts: number;
  readonly categories: number;
  readonly transactions: number;
  readonly transfers: number;
}

export interface ImportExcelCommitSummaryDto {
  readonly accountsInserted: number;
  readonly accountsUpdated: number;
  readonly accountsSkipped: number;
  readonly categoriesInserted: number;
  readonly categoriesUpdated: number;
  readonly categoriesSkipped: number;
  readonly transactionsInserted: number;
  readonly transfersInserted: number;
}

export interface ImportExcelValidationDto {
  readonly ok: boolean;
  readonly errors: readonly ImportExcelErrorDto[];
  readonly summary?: ImportExcelValidationSummaryDto;
}

export interface ImportExcelResultDto {
  readonly ok: boolean;
  readonly errors?: readonly ImportExcelErrorDto[];
  readonly result?: ImportExcelCommitSummaryDto;
}

export interface ImportExcelSelectFileResultDto {
  readonly filePath: string;
}

export type ImportExcelSelectFileResponse = ImportExcelSelectFileResultDto | null;
export type ImportExcelValidateDto = string;
export type ImportExcelValidateResponse = ImportExcelValidationDto;
export type ImportExcelCommitDto = string;
export type ImportExcelCommitResponse = ImportExcelResultDto;
