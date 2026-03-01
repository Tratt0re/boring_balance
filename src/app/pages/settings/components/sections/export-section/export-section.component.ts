import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { toast } from 'ngx-sonner';

import type { ExportXlsxResultDto } from '@/pages/data-backups-page/models/export.models';
import { ExportService } from '@/pages/data-backups-page/services/export.service';
import { ZardButtonComponent } from '@/shared/components/button';

@Component({
  selector: 'app-export-section',
  imports: [TranslatePipe, ZardButtonComponent],
  templateUrl: './export-section.component.html',
  styleUrl: './export-section.component.scss',
})
export class ExportSectionComponent {
  private readonly exportService = inject(ExportService);
  private readonly translateService = inject(TranslateService);

  protected readonly exportLoading = toSignal(this.exportService.loading$, {
    initialValue: false,
  });
  protected readonly lastExportResult = signal<ExportXlsxResultDto | null>(null);

  protected onExportXlsx(): void {
    if (this.exportLoading()) {
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

  private toErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message.trim();
    }

    return fallbackMessage;
  }
}
