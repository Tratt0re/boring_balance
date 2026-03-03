export interface ExportXlsxResultDto {
  readonly filePath: string;
  readonly fileName: string;
}

export interface DownloadImportTemplateResultDto {
  readonly filePath: string;
  readonly fileName: string;
}

export type ExportXlsxResponse = ExportXlsxResultDto | null;
export type DownloadImportTemplateResponse = DownloadImportTemplateResultDto | null;
