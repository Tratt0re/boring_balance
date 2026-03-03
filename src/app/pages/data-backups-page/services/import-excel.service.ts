import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, finalize, from, map, of, tap } from 'rxjs';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

@Injectable({
  providedIn: 'root',
})
export class ImportExcelService extends BaseIpcService<APIChannel.IMPORT_EXCEL> {
  private readonly selectedFilePathSubject = new BehaviorSubject<string | null>(null);
  private readonly validationSubject = new BehaviorSubject<DTO.ImportExcelValidationDto | null>(null);
  private readonly selectingSubject = new BehaviorSubject(false);
  private readonly validatingSubject = new BehaviorSubject(false);
  private readonly importingSubject = new BehaviorSubject(false);

  readonly selectedFilePath$ = this.selectedFilePathSubject.asObservable();
  readonly validation$ = this.validationSubject.asObservable();
  readonly selecting$ = this.selectingSubject.asObservable();
  readonly validating$ = this.validatingSubject.asObservable();
  readonly importing$ = this.importingSubject.asObservable();

  constructor() {
    super(APIChannel.IMPORT_EXCEL);
  }

  selectFile(): Observable<DTO.ImportExcelSelectFileResponse> {
    if (this.selectingSubject.value) {
      return of(null);
    }

    this.selectingSubject.next(true);

    return from(this.ipcClient.selectFile()).pipe(
      map((result) => this.normalizeSelectFileResult(result)),
      tap((result) => {
        if (!result) {
          return;
        }

        this.selectedFilePathSubject.next(result.filePath);
        this.validationSubject.next(null);
      }),
      finalize(() => this.selectingSubject.next(false)),
    );
  }

  validate(filePath: string): Observable<DTO.ImportExcelValidationDto> {
    this.validatingSubject.next(true);

    return from(this.ipcClient.validate(filePath)).pipe(
      map((result) => this.normalizeValidationResult(result)),
      tap((result) => {
        this.validationSubject.next(result);
      }),
      finalize(() => this.validatingSubject.next(false)),
    );
  }

  commit(filePath: string): Observable<DTO.ImportExcelResultDto> {
    this.importingSubject.next(true);

    return from(this.ipcClient.commit(filePath)).pipe(
      map((result) => this.normalizeCommitResult(result)),
      tap((result) => {
        if (!result.ok) {
          this.validationSubject.next({
            ok: false,
            errors: result.errors ?? [],
          });
        }
      }),
      finalize(() => this.importingSubject.next(false)),
    );
  }

  clearSelection(): void {
    if (this.selectingSubject.value || this.validatingSubject.value || this.importingSubject.value) {
      return;
    }

    this.selectedFilePathSubject.next(null);
    this.validationSubject.next(null);
  }

  private normalizeSelectFileResult(value: DTO.ImportExcelSelectFileResponse): DTO.ImportExcelSelectFileResponse {
    const filePath =
      typeof value?.filePath === 'string' && value.filePath.trim().length > 0 ? value.filePath.trim() : null;

    return filePath
      ? {
          filePath,
        }
      : null;
  }

  private normalizeValidationResult(value: DTO.ImportExcelValidateResponse): DTO.ImportExcelValidationDto {
    const summary = this.normalizeValidationSummary(value?.summary);

    return {
      ok: Boolean(value?.ok),
      errors: this.normalizeErrors(value?.errors),
      ...(summary ? { summary } : {}),
    };
  }

  private normalizeCommitResult(value: DTO.ImportExcelCommitResponse): DTO.ImportExcelResultDto {
    const result = this.normalizeCommitSummary(value?.result);
    const errors = this.normalizeErrors(value?.errors);

    return {
      ok: Boolean(value?.ok),
      ...(errors.length > 0 ? { errors } : {}),
      ...(result ? { result } : {}),
    };
  }

  private normalizeErrors(value: unknown): readonly DTO.ImportExcelErrorDto[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((entry) => this.normalizeError(entry));
  }

  private normalizeError(value: unknown): DTO.ImportExcelErrorDto {
    const rawValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const rowValue = Number((rawValue as DTO.ImportExcelErrorDto).row);
    const columnValue = (rawValue as DTO.ImportExcelErrorDto).column;

    return {
      sheet: this.normalizeString((rawValue as DTO.ImportExcelErrorDto).sheet, 'workbook'),
      row: Number.isInteger(rowValue) && rowValue > 0 ? rowValue : 0,
      ...(typeof columnValue === 'string' && columnValue.trim().length > 0
        ? { column: columnValue.trim() }
        : {}),
      code: this.normalizeString((rawValue as DTO.ImportExcelErrorDto).code, 'UNKNOWN'),
      message: this.normalizeString((rawValue as DTO.ImportExcelErrorDto).message, 'Unknown import error.'),
    };
  }

  private normalizeValidationSummary(
    value: DTO.ImportExcelValidationSummaryDto | undefined,
  ): DTO.ImportExcelValidationSummaryDto | undefined {
    if (!value) {
      return undefined;
    }

    const summary = {
      accounts: this.normalizeCount(value.accounts),
      categories: this.normalizeCount(value.categories),
      transactions: this.normalizeCount(value.transactions),
      transfers: this.normalizeCount(value.transfers),
    };

    return summary;
  }

  private normalizeCommitSummary(
    value: DTO.ImportExcelCommitSummaryDto | undefined,
  ): DTO.ImportExcelCommitSummaryDto | undefined {
    if (!value) {
      return undefined;
    }

    return {
      accountsInserted: this.normalizeCount(value.accountsInserted),
      accountsUpdated: this.normalizeCount(value.accountsUpdated),
      accountsSkipped: this.normalizeCount(value.accountsSkipped),
      categoriesInserted: this.normalizeCount(value.categoriesInserted),
      categoriesUpdated: this.normalizeCount(value.categoriesUpdated),
      categoriesSkipped: this.normalizeCount(value.categoriesSkipped),
      transactionsInserted: this.normalizeCount(value.transactionsInserted),
      transfersInserted: this.normalizeCount(value.transfersInserted),
    };
  }

  private normalizeCount(value: unknown): number {
    const normalizedValue = Number(value);
    return Number.isInteger(normalizedValue) && normalizedValue >= 0 ? normalizedValue : 0;
  }

  private normalizeString(value: unknown, fallbackValue: string): string {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallbackValue;
  }
}
