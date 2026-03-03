import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, finalize, from, map, of } from 'rxjs';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';
import type {
  DownloadImportTemplateResponseDto,
  ExportXlsxResponseDto,
} from '../models/export.models';

@Injectable({
  providedIn: 'root',
})
export class ExportService extends BaseIpcService<APIChannel.DATA_EXPORT> {
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly downloadTemplateLoadingSubject = new BehaviorSubject(false);

  readonly loading$ = this.loadingSubject.asObservable();
  readonly downloadTemplateLoading$ = this.downloadTemplateLoadingSubject.asObservable();

  constructor() {
    super(APIChannel.DATA_EXPORT);
  }

  exportXlsx(): Observable<ExportXlsxResponseDto> {
    if (this.loadingSubject.value) {
      return of(null);
    }

    this.loadingSubject.next(true);

    return from(this.ipcClient.exportXlsx()).pipe(
      map((result) => this.normalizeFileResult(result)),
      finalize(() => this.loadingSubject.next(false)),
    );
  }

  downloadImportTemplate(): Observable<DownloadImportTemplateResponseDto> {
    if (this.downloadTemplateLoadingSubject.value) {
      return of(null);
    }

    this.downloadTemplateLoadingSubject.next(true);

    return from(this.ipcClient.downloadImportTemplate()).pipe(
      map((result) => this.normalizeFileResult(result)),
      finalize(() => this.downloadTemplateLoadingSubject.next(false)),
    );
  }

  private normalizeFileResult(
    value: DTO.ExportXlsxResponse | DTO.DownloadImportTemplateResponse,
  ): ExportXlsxResponseDto | DownloadImportTemplateResponseDto {
    if (!value) {
      return null;
    }

    const filePath = typeof value.filePath === 'string' && value.filePath.trim().length > 0
      ? value.filePath.trim()
      : null;
    const fileName = typeof value.fileName === 'string' && value.fileName.trim().length > 0
      ? value.fileName.trim()
      : null;

    if (!filePath || !fileName) {
      return null;
    }

    return {
      filePath,
      fileName,
    };
  }
}
