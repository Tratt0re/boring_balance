import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { toast } from 'ngx-sonner';

import { AppDataTableComponent, type TableDataItem } from '@/components/data-table';
import type {
  DownloadImportTemplateResultDto,
  ExportXlsxResultDto,
} from '@/pages/data-backups-page/models/export.models';
import type {
  ImportExcelErrorDto,
  ImportExcelResultDto,
  ImportExcelValidationDto,
} from '@/pages/data-backups-page/models/import-excel.models';
import { ExportService } from '@/pages/data-backups-page/services/export.service';
import { ImportExcelService } from '@/pages/data-backups-page/services/import-excel.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardButtonComponent } from '@/shared/components/button';

interface ImportErrorTableRow {
  readonly id: string;
  readonly sheet: string;
  readonly row: number;
  readonly column: string;
  readonly message: string;
}

const IMPORT_ERROR_TABLE_STRUCTURE: readonly TableDataItem[] = [
  {
    columnName: 'dataBackups.exportImport.import.errors.columns.sheet',
    columnKey: 'sheet',
    type: 'string',
    sortable: true,
  },
  {
    columnName: 'dataBackups.exportImport.import.errors.columns.row',
    columnKey: 'row',
    type: 'number',
    align: 'right',
    sortable: true,
  },
  {
    columnName: 'dataBackups.exportImport.import.errors.columns.column',
    columnKey: 'column',
    type: 'string',
    sortable: true,
  },
  {
    columnName: 'dataBackups.exportImport.import.errors.columns.message',
    columnKey: 'message',
    type: 'string',
  },
] as const;

@Component({
  selector: 'app-export-section',
  imports: [AppDataTableComponent, TranslatePipe, ZardButtonComponent],
  templateUrl: './export-section.component.html',
  styleUrl: './export-section.component.scss',
})
export class ExportSectionComponent {
  private readonly exportService = inject(ExportService);
  private readonly importExcelService = inject(ImportExcelService);
  private readonly alertDialogService = inject(ZardAlertDialogService);
  private readonly translateService = inject(TranslateService);

  protected readonly exportLoading = toSignal(this.exportService.loading$, {
    initialValue: false,
  });
  protected readonly downloadImportTemplateLoading = toSignal(this.exportService.downloadTemplateLoading$, {
    initialValue: false,
  });
  protected readonly selectedImportFilePath = toSignal(this.importExcelService.selectedFilePath$, {
    initialValue: null,
  });
  protected readonly importValidation = toSignal(this.importExcelService.validation$, {
    initialValue: null as ImportExcelValidationDto | null,
  });
  protected readonly selectingImportFile = toSignal(this.importExcelService.selecting$, {
    initialValue: false,
  });
  protected readonly validatingImport = toSignal(this.importExcelService.validating$, {
    initialValue: false,
  });
  protected readonly importingData = toSignal(this.importExcelService.importing$, {
    initialValue: false,
  });
  protected readonly importErrorTableStructure = IMPORT_ERROR_TABLE_STRUCTURE;
  protected readonly lastExportResult = signal<ExportXlsxResultDto | null>(null);
  protected readonly lastImportResult = signal<ImportExcelResultDto | null>(null);
  protected readonly selectedImportFileName = computed(() =>
    this.extractFileName(this.selectedImportFilePath()),
  );
  protected readonly importBusy = computed(
    () => this.selectingImportFile() || this.validatingImport() || this.importingData(),
  );
  protected readonly templateBusy = computed(
    () => this.downloadImportTemplateLoading() || this.exportLoading() || this.importBusy(),
  );
  protected readonly canSelectImportFile = computed(
    () => !this.importBusy() && !this.downloadImportTemplateLoading(),
  );
  protected readonly canRemoveImportFile = computed(
    () => Boolean(this.selectedImportFilePath()) && !this.importBusy(),
  );
  protected readonly canImport = computed(
    () =>
      Boolean(this.selectedImportFilePath())
      && this.importValidation()?.ok === true
      && !this.importBusy(),
  );
  protected readonly importPreviewSummary = computed(() => {
    const validation = this.importValidation();
    return validation?.ok ? validation.summary ?? null : null;
  });
  protected readonly importErrorRows = computed<readonly ImportErrorTableRow[]>(() =>
    (this.importValidation()?.errors ?? []).map((error, index) => this.toImportErrorTableRow(error, index)),
  );
  protected readonly importResultSummary = computed(() => this.lastImportResult()?.result ?? null);

  protected onExportXlsx(): void {
    if (this.exportLoading() || this.downloadImportTemplateLoading()) {
      return;
    }

    void firstValueFrom(this.exportService.exportXlsx())
      .then((result) => {
        if (!result) {
          return;
        }

        this.lastExportResult.set(result);
        toast.success(
          this.translateService.instant('dataBackups.exportImport.messages.success', {
            fileName: result.fileName,
          }),
        );
      })
      .catch((error) => {
        toast.error(
          this.toErrorMessage(
            error,
            this.translateService.instant('dataBackups.exportImport.messages.error'),
          ),
        );
      });
  }

  protected onDownloadImportTemplate(): void {
    if (this.templateBusy()) {
      return;
    }

    void firstValueFrom(this.exportService.downloadImportTemplate())
      .then((result) => {
        if (!result) {
          return;
        }

        this.showTemplateDownloadSuccess(result);
      })
      .catch((error) => {
        toast.error(
          this.toErrorMessage(
            error,
            this.translateService.instant('dataBackups.exportImport.import.template.messages.error'),
          ),
        );
      });
  }

  protected onSelectImportFile(): void {
    if (!this.canSelectImportFile()) {
      return;
    }

    void firstValueFrom(this.importExcelService.selectFile())
      .then((result) => {
        if (!result) {
          return;
        }

        this.lastImportResult.set(null);
      })
      .catch((error) => {
        toast.error(
          this.toErrorMessage(
            error,
            this.translateService.instant('dataBackups.exportImport.import.messages.selectError'),
          ),
        );
      });
  }

  protected onRemoveImportFile(): void {
    if (!this.canRemoveImportFile()) {
      return;
    }

    this.importExcelService.clearSelection();
    this.lastImportResult.set(null);
  }

  protected onValidateImport(): void {
    const filePath = this.selectedImportFilePath();
    if (!filePath) {
      toast.error(this.translateService.instant('dataBackups.exportImport.import.messages.fileRequired'));
      return;
    }

    if (this.validatingImport()) {
      return;
    }

    this.lastImportResult.set(null);

    void firstValueFrom(this.importExcelService.validate(filePath)).catch((error) => {
      toast.error(
        this.toErrorMessage(
          error,
          this.translateService.instant('dataBackups.exportImport.import.messages.validateError'),
        ),
      );
    });
  }

  protected onConfirmImport(): void {
    const filePath = this.selectedImportFilePath();
    if (!filePath || !this.canImport()) {
      return;
    }

    this.alertDialogService.confirm({
      zTitle: this.translateService.instant('dataBackups.exportImport.import.confirm.title'),
      zDescription: this.translateService.instant('dataBackups.exportImport.import.confirm.description'),
      zOkText: this.translateService.instant('dataBackups.exportImport.import.confirm.actions.import'),
      zCancelText: this.translateService.instant('dataBackups.exportImport.import.confirm.actions.cancel'),
      zOkDestructive: true,
      zMaskClosable: true,
      zClosable: true,
      zOnOk: () => {
        this.runImport(filePath);
      },
    });
  }

  private toErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message.trim();
    }

    return fallbackMessage;
  }

  private runImport(filePath: string): void {
    if (this.importingData()) {
      return;
    }

    void firstValueFrom(this.importExcelService.commit(filePath))
      .then((result) => {
        this.lastImportResult.set(result.ok ? result : null);

        if (!result.ok) {
          toast.error(this.toImportFailureMessage(result));
          return;
        }

        toast.success(this.translateService.instant('dataBackups.exportImport.import.messages.importSuccess'));
        this.triggerApplicationRefreshAfterImport();
      })
      .catch((error) => {
        this.lastImportResult.set(null);
        toast.error(
          this.toErrorMessage(
            error,
            this.translateService.instant('dataBackups.exportImport.import.messages.importError'),
          ),
        );
      });
  }

  private toImportErrorTableRow(error: ImportExcelErrorDto, index: number): ImportErrorTableRow {
    return {
      id: `${error.sheet}-${error.row}-${error.column ?? 'none'}-${index}`,
      sheet: error.sheet,
      row: error.row,
      column: error.column ?? '-',
      message: error.message,
    };
  }

  private toImportFailureMessage(result: ImportExcelResultDto): string {
    const firstError = result.errors?.[0];
    if (!firstError) {
      return this.translateService.instant('dataBackups.exportImport.import.messages.importError');
    }

    const locationParts = [firstError.sheet];
    if (firstError.row > 0) {
      locationParts.push(`row ${firstError.row}`);
    }

    if (firstError.column) {
      locationParts.push(firstError.column);
    }

    return `${locationParts.join(' / ')}: ${firstError.message}`;
  }

  private extractFileName(filePath: string | null): string | null {
    if (!filePath) {
      return null;
    }

    const normalizedPath = filePath.trim();
    if (normalizedPath.length === 0) {
      return null;
    }

    const segments = normalizedPath.split(/[/\\]/u);
    const fileName = segments[segments.length - 1]?.trim() ?? '';

    return fileName.length > 0 ? fileName : normalizedPath;
  }

  private triggerApplicationRefreshAfterImport(): void {
    if (typeof window === 'undefined') {
      return;
    }

    globalThis.setTimeout(() => {
      globalThis.location.reload();
    }, 800);
  }

  private showTemplateDownloadSuccess(result: DownloadImportTemplateResultDto): void {
    toast.success(
      this.translateService.instant('dataBackups.exportImport.import.template.messages.success', {
        fileName: result.fileName,
      }),
    );
  }
}
