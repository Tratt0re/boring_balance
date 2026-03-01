export interface ExportXlsxResultDto {
  readonly filePath: string;
  readonly fileName: string;
}

export type ExportXlsxResponse = ExportXlsxResultDto | null;
