import { Injectable, inject } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  catchError,
  finalize,
  firstValueFrom,
  from,
  map,
  of,
  tap,
  throwError,
} from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';
import { reloadAppShell } from '@/shared/utils/reload-app-shell';
import { WindowService } from './window.service';
import { BaseIpcService } from './base-ipc.service';

const BACKUP_SETTINGS_DEFAULTS: DTO.BackupSettingsDto = {
  enabled: false,
  folderPath: null,
  autoBackupOnQuit: true,
  autoBackupIntervalMin: 0,
  retentionCount: 1,
};

const BACKUP_STATE_DEFAULTS: DTO.BackupStateDto = {
  lastBackupAtMs: null,
  lastBackupFileName: null,
  lastBackupStatus: 'idle',
  lastBackupError: null,
  lastCleanupWarning: null,
  configurationWarning: null,
  lastBackedUpChangeCounter: null,
};

const BACKUP_AUTO_INTERVAL_OPTIONS = [0, 30, 60, 120];
const BACKUP_RETENTION_OPTIONS = [1, 2, 3, 4, 5];

@Injectable({
  providedIn: 'root',
})
export class BackupService extends BaseIpcService<APIChannel.BACKUP> {
  private readonly windowService = inject(WindowService);
  private readonly translateService = inject(TranslateService);
  private readonly settingsSubject = new BehaviorSubject<DTO.BackupSettingsDto>(
    BACKUP_SETTINGS_DEFAULTS,
  );
  private readonly stateSubject = new BehaviorSubject<DTO.BackupStateDto>(BACKUP_STATE_DEFAULTS);
  private readonly backupsSubject = new BehaviorSubject<readonly DTO.BackupFileInfoDto[]>([]);
  private readonly settingsLoadingSubject = new BehaviorSubject(false);
  private readonly stateLoadingSubject = new BehaviorSubject(false);
  private readonly backupsLoadingSubject = new BehaviorSubject(false);
  private readonly runNowLoadingSubject = new BehaviorSubject(false);
  private readonly restoreLoadingSubject = new BehaviorSubject(false);
  private readonly removeLoadingSubject = new BehaviorSubject(false);

  private eventsBound = false;
  private initializationPromise: Promise<void> | null = null;

  readonly settings$ = this.settingsSubject.asObservable();
  readonly state$ = this.stateSubject.asObservable();
  readonly backups$ = this.backupsSubject.asObservable();
  readonly settingsLoading$ = this.settingsLoadingSubject.asObservable();
  readonly stateLoading$ = this.stateLoadingSubject.asObservable();
  readonly backupsLoading$ = this.backupsLoadingSubject.asObservable();
  readonly runNowLoading$ = this.runNowLoadingSubject.asObservable();
  readonly restoreLoading$ = this.restoreLoadingSubject.asObservable();
  readonly removeLoading$ = this.removeLoadingSubject.asObservable();

  constructor() {
    super(APIChannel.BACKUP);
    this.bindIpcEvents();
  }

  initialize(): Observable<void> {
    if (this.initializationPromise) {
      return from(this.initializationPromise);
    }

    this.initializationPromise = Promise.all([
      firstValueFrom(this.getSettings()),
      firstValueFrom(this.getState()),
    ])
      .then(([settings]) => {
        if (settings?.enabled && settings.folderPath) {
          return firstValueFrom(this.listBackups()).then(() => undefined);
        }

        this.backupsSubject.next([]);
        return undefined;
      })
      .finally(() => {
        this.initializationPromise = null;
      });

    return from(this.initializationPromise);
  }

  getSettings(): Observable<DTO.BackupSettingsDto> {
    this.settingsLoadingSubject.next(true);

    return from(this.ipcClient.getSettings()).pipe(
      map((settings) => this.normalizeSettings(settings)),
      tap((settings) => {
        this.settingsSubject.next(settings);
      }),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('loadSettingsFailed')));
        return of(this.settingsSubject.value);
      }),
      finalize(() => this.settingsLoadingSubject.next(false)),
    );
  }

  updateSettings(patch: DTO.BackupUpdateSettingsDto): Observable<DTO.BackupSettingsDto> {
    this.settingsLoadingSubject.next(true);

    return from(this.ipcClient.updateSettings(patch)).pipe(
      map((settings) => this.normalizeSettings(settings)),
      tap((settings) => {
        this.settingsSubject.next(settings);
      }),
      tap((settings) => {
        if (settings.enabled && settings.folderPath) {
          void firstValueFrom(this.listBackups());
          return;
        }

        this.backupsSubject.next([]);
      }),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('updateSettingsFailed')));
        return of(this.settingsSubject.value);
      }),
      finalize(() => this.settingsLoadingSubject.next(false)),
    );
  }

  getState(): Observable<DTO.BackupStateDto> {
    this.stateLoadingSubject.next(true);

    return from(this.ipcClient.getState()).pipe(
      map((state) => this.normalizeState(state)),
      tap((state) => {
        this.stateSubject.next(state);
      }),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('loadStateFailed')));
        return of(this.stateSubject.value);
      }),
      finalize(() => this.stateLoadingSubject.next(false)),
    );
  }

  selectFolder(): Observable<DTO.BackupSelectFolderResponse> {
    return from(this.ipcClient.selectFolder()).pipe(
      map((result) => {
        if (!result?.folderPath) {
          return null;
        }

        return {
          folderPath: String(result.folderPath),
        };
      }),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('selectFolderFailed')));
        return of(null);
      }),
    );
  }

  listBackups(): Observable<readonly DTO.BackupFileInfoDto[]> {
    this.backupsLoadingSubject.next(true);

    return from(this.ipcClient.list()).pipe(
      map((rows) =>
        [...rows]
          .map((row) => this.normalizeBackupFileInfo(row))
          .sort((left, right) => right.createdAtMs - left.createdAtMs),
      ),
      tap((rows) => {
        this.backupsSubject.next(rows);
      }),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('loadListFailed')));
        return of(this.backupsSubject.value);
      }),
      finalize(() => this.backupsLoadingSubject.next(false)),
    );
  }

  selectRestoreFile(): Observable<DTO.BackupSelectRestoreFileResponse> {
    return from(this.ipcClient.selectRestoreFile()).pipe(
      map((result) => {
        if (!result?.filePath) {
          return null;
        }

        return {
          filePath: String(result.filePath),
          fileName: String(result.fileName ?? ''),
        };
      }),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('selectFileFailed')));
        return of(null);
      }),
    );
  }

  runNow(): Observable<DTO.CreateBackupResultDto> {
    this.runNowLoadingSubject.next(true);

    return from(this.ipcClient.runNow()).pipe(
      map((result) => this.normalizeCreateBackupResult(result)),
      finalize(() => this.runNowLoadingSubject.next(false)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('backupFailed')));
        return throwError(() => error);
      }),
    );
  }

  restore(backupFilePath: string): Observable<DTO.RestoreBackupResultDto> {
    this.restoreLoadingSubject.next(true);

    return from(this.ipcClient.restore({ backupFilePath })).pipe(
      map((result) => this.normalizeRestoreResult(result)),
      finalize(() => this.restoreLoadingSubject.next(false)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('restoreFailed')));
        return throwError(() => error);
      }),
    );
  }

  remove(backupFilePath: string): Observable<DTO.BackupRemoveResponse> {
    this.removeLoadingSubject.next(true);

    return from(this.ipcClient.remove({ backupFilePath })).pipe(
      tap((result) => {
        if (Number(result?.changed ?? 0) > 0) {
          toast.success(this.text('deleted'));
        }

        void firstValueFrom(this.listBackups());
      }),
      finalize(() => this.removeLoadingSubject.next(false)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('deleteFailed')));
        return throwError(() => error);
      }),
    );
  }

  private bindIpcEvents(): void {
    if (this.eventsBound) {
      return;
    }

    const onIpcEvent = window.electronAPI?.onIpcEvent;
    if (!onIpcEvent) {
      return;
    }

    this.eventsBound = true;
    onIpcEvent('backup:stateChanged', (payload) => {
      this.stateSubject.next(this.normalizeState(payload as DTO.BackupStateDto));
    });

    onIpcEvent('backup:backupCompleted', (payload) => {
      const result = this.normalizeCreateBackupResult(payload as DTO.CreateBackupResultDto);
      toast.success(this.text('completed', { fileName: result.fileName }));
      void firstValueFrom(this.listBackups());
    });

    onIpcEvent('backup:backupFailed', (payload) => {
      const errorMessage = this.extractErrorFromPayload(payload, this.text('backupFailed'));
      toast.error(errorMessage);
    });

    onIpcEvent('backup:restoreCompleted', (payload) => {
      this.normalizeRestoreResult(payload as DTO.RestoreBackupResultDto);
      toast.success(this.text('restoreCompleted'));
      this.triggerApplicationRefreshAfterRestore();
    });

    onIpcEvent('backup:restoreFailed', (payload) => {
      const errorMessage = this.extractErrorFromPayload(payload, this.text('restoreFailed'));
      toast.error(errorMessage);
    });
  }

  private normalizeSettings(value: DTO.BackupSettingsDto): DTO.BackupSettingsDto {
    const folderPath = value?.folderPath;
    const autoBackupIntervalMin = Number(value?.autoBackupIntervalMin);
    const retentionCount = Number(value?.retentionCount);

    return {
      enabled: Boolean(value?.enabled),
      folderPath:
        typeof folderPath === 'string' && folderPath.trim().length > 0
          ? folderPath.trim()
          : folderPath === null
            ? null
            : null,
      autoBackupOnQuit: Boolean(value?.autoBackupOnQuit),
      autoBackupIntervalMin:
        Number.isInteger(autoBackupIntervalMin) &&
        BACKUP_AUTO_INTERVAL_OPTIONS.includes(autoBackupIntervalMin)
          ? autoBackupIntervalMin
          : BACKUP_SETTINGS_DEFAULTS.autoBackupIntervalMin,
      retentionCount:
        Number.isInteger(retentionCount) && BACKUP_RETENTION_OPTIONS.includes(retentionCount)
          ? retentionCount
          : BACKUP_SETTINGS_DEFAULTS.retentionCount,
    };
  }

  private normalizeState(value: DTO.BackupStateDto): DTO.BackupStateDto {
    const status = value?.lastBackupStatus;
    const normalizedStatus =
      status === 'idle' || status === 'running' || status === 'ok' || status === 'error'
        ? status
        : BACKUP_STATE_DEFAULTS.lastBackupStatus;

    return {
      lastBackupAtMs: this.normalizeIntegerOrNull(value?.lastBackupAtMs),
      lastBackupFileName:
        typeof value?.lastBackupFileName === 'string' && value.lastBackupFileName.trim().length > 0
          ? value.lastBackupFileName.trim()
          : null,
      lastBackupStatus: normalizedStatus,
      lastBackupError:
        typeof value?.lastBackupError === 'string' && value.lastBackupError.trim().length > 0
          ? value.lastBackupError.trim()
          : null,
      configurationWarning:
        typeof value?.configurationWarning === 'string' &&
        value.configurationWarning.trim().length > 0
          ? value.configurationWarning.trim()
          : null,
      lastCleanupWarning:
        typeof value?.lastCleanupWarning === 'string' && value.lastCleanupWarning.trim().length > 0
          ? value.lastCleanupWarning.trim()
          : null,
      lastBackedUpChangeCounter: this.normalizeIntegerOrNull(value?.lastBackedUpChangeCounter),
    };
  }

  private normalizeBackupFileInfo(value: DTO.BackupFileInfoDto): DTO.BackupFileInfoDto {
    return {
      fileName: String(value?.fileName ?? ''),
      fullPath: String(value?.fullPath ?? ''),
      createdAtMs: this.normalizeIntegerOrNull(value?.createdAtMs) ?? Date.now(),
      sizeBytes: Math.max(0, Number(value?.sizeBytes ?? 0)),
      meta: value?.meta
        ? {
            created_at_ms: this.normalizeIntegerOrNull(value.meta.created_at_ms),
            app_version:
              typeof value.meta.app_version === 'string' && value.meta.app_version.trim().length > 0
                ? value.meta.app_version.trim()
                : null,
            schema_version: this.normalizeIntegerOrNull(value.meta.schema_version),
            db_uuid:
              typeof value.meta.db_uuid === 'string' && value.meta.db_uuid.trim().length > 0
                ? value.meta.db_uuid.trim()
                : null,
            change_counter: this.normalizeIntegerOrNull(value.meta.change_counter),
            last_write_ms: this.normalizeIntegerOrNull(value.meta.last_write_ms),
          }
        : null,
    };
  }

  private normalizeCreateBackupResult(value: DTO.CreateBackupResultDto): DTO.CreateBackupResultDto {
    return {
      fileName: String(value?.fileName ?? ''),
      fullPath: String(value?.fullPath ?? ''),
      createdAtMs: this.normalizeIntegerOrNull(value?.createdAtMs) ?? Date.now(),
      sizeBytes: this.normalizeIntegerOrNull(value?.sizeBytes) ?? undefined,
      meta: value?.meta ?? null,
    };
  }

  private normalizeRestoreResult(value: DTO.RestoreBackupResultDto): DTO.RestoreBackupResultDto {
    return {
      restoredFrom: String(value?.restoredFrom ?? ''),
      restoredTo: String(value?.restoredTo ?? ''),
      previousLocalCopyPath:
        typeof value?.previousLocalCopyPath === 'string' &&
        value.previousLocalCopyPath.trim().length > 0
          ? value.previousLocalCopyPath.trim()
          : null,
    };
  }

  private normalizeIntegerOrNull(value: unknown): number | null {
    const normalizedValue = Number(value);
    return Number.isInteger(normalizedValue) ? normalizedValue : null;
  }

  private extractErrorFromPayload(payload: unknown, fallbackMessage: string): string {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return fallbackMessage;
    }

    const errorValue = (payload as { error?: unknown }).error;
    if (typeof errorValue === 'string' && errorValue.trim().length > 0) {
      return errorValue.trim();
    }

    return fallbackMessage;
  }

  /** A message the app owns, translated. Messages from the main process are shown as they arrive. */
  private text(key: string, params?: Record<string, unknown>): string {
    return this.translateService.instant(`dataBackups.toasts.backup.${key}`, params);
  }

  private toErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message.trim();
    }

    return fallbackMessage;
  }

  private triggerApplicationRefreshAfterRestore(): void {
    reloadAppShell(this.windowService, 250);
  }
}
