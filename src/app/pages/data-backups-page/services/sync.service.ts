import { Injectable } from '@angular/core';
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
import { toast } from 'ngx-sonner';

import { APIChannel } from '@/config/api';
import type * as DTO from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';
import {
  SYNC_INTERVAL_OPTIONS,
  SYNC_SETTINGS_DEFAULTS,
  SYNC_STATE_DEFAULTS,
  type RepoStatusDto,
  type SyncActionResultDto,
  type SyncNowResultDto,
  type SyncSelectFolderResponseDto,
  type SyncSettingsDto,
  type SyncSnapshotInfoDto,
  type SyncStateDto,
} from '../models/sync.models';

@Injectable({
  providedIn: 'root',
})
export class SyncService extends BaseIpcService<APIChannel.SYNC> {
  private readonly settingsSubject = new BehaviorSubject<SyncSettingsDto>(SYNC_SETTINGS_DEFAULTS);
  private readonly stateSubject = new BehaviorSubject<SyncStateDto>(SYNC_STATE_DEFAULTS);
  private readonly settingsLoadingSubject = new BehaviorSubject(false);
  private readonly stateLoadingSubject = new BehaviorSubject(false);
  private readonly repoStatusLoadingSubject = new BehaviorSubject(false);
  private readonly enableLoadingSubject = new BehaviorSubject(false);
  private readonly disableLoadingSubject = new BehaviorSubject(false);
  private readonly syncNowLoadingSubject = new BehaviorSubject(false);
  private readonly pullNowLoadingSubject = new BehaviorSubject(false);
  private readonly pushNowLoadingSubject = new BehaviorSubject(false);

  private eventsBound = false;
  private initializationPromise: Promise<void> | null = null;

  readonly settings$ = this.settingsSubject.asObservable();
  readonly state$ = this.stateSubject.asObservable();
  readonly settingsLoading$ = this.settingsLoadingSubject.asObservable();
  readonly stateLoading$ = this.stateLoadingSubject.asObservable();
  readonly repoStatusLoading$ = this.repoStatusLoadingSubject.asObservable();
  readonly enableLoading$ = this.enableLoadingSubject.asObservable();
  readonly disableLoading$ = this.disableLoadingSubject.asObservable();
  readonly syncNowLoading$ = this.syncNowLoadingSubject.asObservable();
  readonly pullNowLoading$ = this.pullNowLoadingSubject.asObservable();
  readonly pushNowLoading$ = this.pushNowLoadingSubject.asObservable();

  constructor() {
    super(APIChannel.SYNC);
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
      .then(() => undefined)
      .finally(() => {
        this.initializationPromise = null;
      });

    return from(this.initializationPromise);
  }

  getSettings(): Observable<SyncSettingsDto> {
    this.settingsLoadingSubject.next(true);

    return from(this.ipcClient.getSettings()).pipe(
      map((settings) => this.normalizeSettings(settings)),
      tap((settings) => {
        this.settingsSubject.next(settings);
      }),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, 'Failed to load sync settings.'));
        return of(this.settingsSubject.value);
      }),
      finalize(() => this.settingsLoadingSubject.next(false)),
    );
  }

  updateSettings(patch: DTO.SyncUpdateSettingsDto): Observable<SyncSettingsDto> {
    this.settingsLoadingSubject.next(true);

    return from(this.ipcClient.updateSettings(patch)).pipe(
      map((settings) => this.normalizeSettings(settings)),
      tap((settings) => {
        this.settingsSubject.next(settings);
      }),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, 'Failed to update sync settings.'));
        return of(this.settingsSubject.value);
      }),
      finalize(() => this.settingsLoadingSubject.next(false)),
    );
  }

  getState(): Observable<SyncStateDto> {
    this.stateLoadingSubject.next(true);

    return from(this.ipcClient.getState()).pipe(
      map((state) => this.normalizeState(state)),
      tap((state) => {
        this.stateSubject.next(state);
      }),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, 'Failed to load sync state.'));
        return of(this.stateSubject.value);
      }),
      finalize(() => this.stateLoadingSubject.next(false)),
    );
  }

  selectFolder(): Observable<SyncSelectFolderResponseDto | null> {
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
        toast.error(this.toErrorMessage(error, 'Failed to select a sync folder.'));
        return of(null);
      }),
    );
  }

  repoStatus(folderPath?: string): Observable<RepoStatusDto> {
    this.repoStatusLoadingSubject.next(true);

    const payload = folderPath ? { folderPath } : undefined;
    return from(this.ipcClient.repoStatus(payload)).pipe(
      map((result) => this.normalizeRepoStatus(result)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, 'Failed to inspect the selected sync folder.'));
        return of({
          exists: false,
          repoPath: null,
        });
      }),
      finalize(() => this.repoStatusLoadingSubject.next(false)),
    );
  }

  enable(folderPath: string): Observable<DTO.SyncEnableResponseDto> {
    this.enableLoadingSubject.next(true);

    return from(
      this.ipcClient.enable({
        folderPath,
      }),
    ).pipe(
      tap(() => {
        toast.success('Sync enabled.');
        void this.refreshSettingsAndState();
      }),
      finalize(() => this.enableLoadingSubject.next(false)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, 'Failed to enable sync.'));
        return throwError(() => error);
      }),
    );
  }

  disable(): Observable<DTO.SyncDisableResponseDto> {
    this.disableLoadingSubject.next(true);

    return from(this.ipcClient.disable()).pipe(
      tap(() => {
        this.settingsSubject.next({
          ...this.settingsSubject.value,
          enabled: false,
        });
        toast.success('Sync disabled.');
        void this.refreshSettingsAndState();
      }),
      finalize(() => this.disableLoadingSubject.next(false)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, 'Failed to disable sync.'));
        return throwError(() => error);
      }),
    );
  }

  syncNow(): Observable<SyncNowResultDto> {
    this.syncNowLoadingSubject.next(true);

    return from(this.ipcClient.syncNow()).pipe(
      map((result) => this.normalizeSyncNowResult(result)),
      tap((result) => {
        if (!result.pulled && !result.pushed) {
          toast.success('Sync check completed. Nothing changed.');
        }
      }),
      finalize(() => this.syncNowLoadingSubject.next(false)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, 'Sync failed.'));
        return throwError(() => error);
      }),
    );
  }

  pullNow(): Observable<SyncActionResultDto> {
    this.pullNowLoadingSubject.next(true);

    return from(this.ipcClient.pullNow()).pipe(
      map((result) => this.normalizeActionResult(result)),
      tap((result) => {
        if (result.action === 'skipped') {
          toast.success(result.reason ?? 'No newer remote snapshot was found.');
        }
      }),
      finalize(() => this.pullNowLoadingSubject.next(false)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, 'Pull failed.'));
        return throwError(() => error);
      }),
    );
  }

  pushNow(): Observable<SyncActionResultDto> {
    this.pushNowLoadingSubject.next(true);

    return from(this.ipcClient.pushNow()).pipe(
      map((result) => this.normalizeActionResult(result)),
      tap((result) => {
        if (result.action === 'skipped') {
          toast.success(result.reason ?? 'No local changes needed to be published.');
        }
      }),
      finalize(() => this.pushNowLoadingSubject.next(false)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, 'Push failed.'));
        return throwError(() => error);
      }),
    );
  }

  listSnapshots(): Observable<readonly SyncSnapshotInfoDto[]> {
    return from(this.ipcClient.listSnapshots()).pipe(
      map((rows) => rows.map((row) => this.normalizeSnapshotInfo(row))),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, 'Failed to load sync snapshots.'));
        return of([] as readonly SyncSnapshotInfoDto[]);
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
    onIpcEvent('sync:stateChanged', (payload) => {
      this.stateSubject.next(this.normalizeState(payload as DTO.SyncStateDto));
    });

    onIpcEvent('sync:pullCompleted', (payload) => {
      const result = this.normalizeActionResult(payload as DTO.SyncActionResultDto);
      toast.success(`Pull completed${result.snapshotId ? ` (${result.snapshotId})` : '.'}`);
      void this.refreshSettingsAndState();
    });

    onIpcEvent('sync:pullFailed', (payload) => {
      const errorMessage = this.extractErrorFromPayload(payload, 'Pull failed.');
      toast.error(errorMessage);
    });

    onIpcEvent('sync:pushCompleted', (payload) => {
      const result = this.normalizeActionResult(payload as DTO.SyncActionResultDto);
      toast.success(`Push completed${result.snapshotId ? ` (${result.snapshotId})` : '.'}`);
      void this.refreshSettingsAndState();
    });

    onIpcEvent('sync:pushFailed', (payload) => {
      const errorMessage = this.extractErrorFromPayload(payload, 'Push failed.');
      toast.error(errorMessage);
    });

    onIpcEvent('sync:conflictDetected', (payload) => {
      const conflictInfo = this.normalizeConflictInfo(payload as DTO.SyncConflictInfoDto | null);
      const currentState = this.stateSubject.value;

      this.stateSubject.next({
        ...currentState,
        status: 'conflict',
        conflictInfo,
        lastError: conflictInfo?.reason ?? currentState.lastError,
      });
      toast.error('Sync conflict detected. Review the details below.');
      void this.refreshSettingsAndState();
    });
  }

  private normalizeSettings(value: DTO.SyncSettingsDto): SyncSettingsDto {
    const folderPath =
      typeof value?.folderPath === 'string' && value.folderPath.trim().length > 0
        ? value.folderPath.trim()
        : typeof value?.baseFolderPath === 'string' && value.baseFolderPath.trim().length > 0
          ? value.baseFolderPath.trim()
          : null;
    const repoFolderName =
      typeof value?.repoFolderName === 'string' && value.repoFolderName.trim().length > 0
        ? value.repoFolderName.trim()
        : SYNC_SETTINGS_DEFAULTS.repoFolderName;
    const autoPullIntervalMin = Number(value?.autoPullIntervalMin);
    const autoPushIntervalMin = Number(value?.autoPushIntervalMin);
    const retentionCountPerDevice = Number(value?.retentionCountPerDevice);

    return {
      enabled: Boolean(value?.enabled),
      folderPath,
      baseFolderPath: folderPath,
      repoFolderName,
      repoPath:
        typeof value?.repoPath === 'string' && value.repoPath.trim().length > 0 ? value.repoPath.trim() : null,
      deviceId:
        typeof value?.deviceId === 'string' && value.deviceId.trim().length > 0 ? value.deviceId.trim() : '',
      deviceName:
        typeof value?.deviceName === 'string' && value.deviceName.trim().length > 0
          ? value.deviceName.trim()
          : null,
      autoPullIntervalMin:
        Number.isInteger(autoPullIntervalMin)
        && SYNC_INTERVAL_OPTIONS.includes(autoPullIntervalMin as (typeof SYNC_INTERVAL_OPTIONS)[number])
          ? autoPullIntervalMin
          : SYNC_SETTINGS_DEFAULTS.autoPullIntervalMin,
      autoPushIntervalMin:
        Number.isInteger(autoPushIntervalMin)
        && SYNC_INTERVAL_OPTIONS.includes(autoPushIntervalMin as (typeof SYNC_INTERVAL_OPTIONS)[number])
          ? autoPushIntervalMin
          : SYNC_SETTINGS_DEFAULTS.autoPushIntervalMin,
      autoPushOnQuit: Boolean(value?.autoPushOnQuit),
      retentionCountPerDevice:
        Number.isInteger(retentionCountPerDevice) && retentionCountPerDevice > 0
          ? retentionCountPerDevice
          : SYNC_SETTINGS_DEFAULTS.retentionCountPerDevice,
      lastSeenRemoteSnapshotId:
        typeof value?.lastSeenRemoteSnapshotId === 'string' && value.lastSeenRemoteSnapshotId.trim().length > 0
          ? value.lastSeenRemoteSnapshotId.trim()
          : null,
      lastPublishedCounter: this.normalizeIntegerOrNull(
        value?.lastPublishedCounter ?? value?.lastPublishedLocalCounter,
      ),
      lastPublishedLocalCounter: this.normalizeIntegerOrNull(value?.lastPublishedLocalCounter),
      lastPulledCounter: this.normalizeIntegerOrNull(value?.lastPulledCounter),
      lastError:
        typeof value?.lastError === 'string' && value.lastError.trim().length > 0 ? value.lastError.trim() : null,
    };
  }

  private normalizeState(value: DTO.SyncStateDto): SyncStateDto {
    const status = value?.status;
    const normalizedStatus =
      status === 'idle' || status === 'running' || status === 'ok' || status === 'error' || status === 'conflict'
        ? status
        : SYNC_STATE_DEFAULTS.status;

    return {
      status: normalizedStatus,
      lastPullAtMs: this.normalizeIntegerOrNull(value?.lastPullAtMs),
      lastPushAtMs: this.normalizeIntegerOrNull(value?.lastPushAtMs),
      lastError:
        typeof value?.lastError === 'string' && value.lastError.trim().length > 0 ? value.lastError.trim() : null,
      remoteLatest: this.normalizeRemoteLatest(value?.remoteLatest ?? null),
      conflictInfo: this.normalizeConflictInfo(value?.conflictInfo ?? null),
    };
  }

  private normalizeConflictInfo(value: DTO.SyncConflictInfoDto | null | undefined): DTO.SyncConflictInfoDto | null {
    if (!value) {
      return null;
    }

    const localCopyPath =
      typeof value.localCopyPath === 'string' && value.localCopyPath.trim().length > 0
        ? value.localCopyPath.trim()
        : null;
    const remoteSnapshotPath =
      typeof value.remoteSnapshotPath === 'string' && value.remoteSnapshotPath.trim().length > 0
        ? value.remoteSnapshotPath.trim()
        : null;
    const reason =
      typeof value.reason === 'string' && value.reason.trim().length > 0 ? value.reason.trim() : null;

    if (!remoteSnapshotPath || !reason) {
      return null;
    }

    return {
      localCopyPath,
      remoteSnapshotPath,
      reason,
    };
  }

  private normalizeRemoteLatest(value: DTO.SyncRemoteLatestDto | null | undefined): DTO.SyncRemoteLatestDto | null {
    if (!value) {
      return null;
    }

    const changeCounter = this.normalizeIntegerOrNull(value.changeCounter);
    const lastWriteMs = this.normalizeIntegerOrNull(value.lastWriteMs);
    const file = typeof value.file === 'string' && value.file.trim().length > 0 ? value.file.trim() : null;

    if (changeCounter === null || lastWriteMs === null || !file) {
      return null;
    }

    return {
      changeCounter,
      lastWriteMs,
      file,
    };
  }

  private normalizeRepoStatus(value: DTO.SyncRepoStatusResponse): RepoStatusDto {
    const repoMeta = value?.repoMeta;
    const normalizedRepoMeta =
      repoMeta
        && typeof repoMeta.repoId === 'string'
        && repoMeta.repoId.trim().length > 0
        && Number.isInteger(this.normalizeIntegerOrNull(repoMeta.createdAtMs))
        && Number.isInteger(this.normalizeIntegerOrNull(repoMeta.syncSchemaVersion))
        ? {
            repo_id: repoMeta.repoId.trim(),
            created_at_ms: this.normalizeIntegerOrNull(repoMeta.createdAtMs) ?? Date.now(),
            sync_schema_version: this.normalizeIntegerOrNull(repoMeta.syncSchemaVersion) ?? 0,
          }
        : undefined;

    return {
      exists: Boolean(value?.exists),
      repoPath:
        typeof value?.repoPath === 'string' && value.repoPath.trim().length > 0 ? value.repoPath.trim() : null,
      repoMeta: normalizedRepoMeta,
    };
  }

  private normalizeActionResult(value: DTO.SyncActionResultDto): SyncActionResultDto {
    return {
      action: String(value?.action ?? ''),
      reason:
        typeof value?.reason === 'string' && value.reason.trim().length > 0 ? value.reason.trim() : null,
      pulled: typeof value?.pulled === 'boolean' ? value.pulled : undefined,
      pushed: typeof value?.pushed === 'boolean' ? value.pushed : undefined,
      repoId: typeof value?.repoId === 'string' && value.repoId.trim().length > 0 ? value.repoId.trim() : null,
      repoPath:
        typeof value?.repoPath === 'string' && value.repoPath.trim().length > 0 ? value.repoPath.trim() : null,
      snapshotId:
        typeof value?.snapshotId === 'string' && value.snapshotId.trim().length > 0
          ? value.snapshotId.trim()
          : null,
      snapshotFile:
        typeof value?.snapshotFile === 'string' && value.snapshotFile.trim().length > 0
          ? value.snapshotFile.trim()
          : null,
      snapshotFilePath:
        typeof value?.snapshotFilePath === 'string' && value.snapshotFilePath.trim().length > 0
          ? value.snapshotFilePath.trim()
          : null,
      remote: this.normalizeRemoteLatest(value?.remote ?? null),
      restoredFrom:
        typeof value?.restoredFrom === 'string' && value.restoredFrom.trim().length > 0
          ? value.restoredFrom.trim()
          : null,
      restoredTo:
        typeof value?.restoredTo === 'string' && value.restoredTo.trim().length > 0
          ? value.restoredTo.trim()
          : null,
      previousLocalCopyPath:
        typeof value?.previousLocalCopyPath === 'string' && value.previousLocalCopyPath.trim().length > 0
          ? value.previousLocalCopyPath.trim()
          : null,
      restoredRemote: typeof value?.restoredRemote === 'boolean' ? value.restoredRemote : undefined,
      createdAtMs: this.normalizeIntegerOrNull(value?.createdAtMs),
      sizeBytes: this.normalizeIntegerOrNull(value?.sizeBytes),
      indexUpdated: typeof value?.indexUpdated === 'boolean' ? value.indexUpdated : undefined,
      selectionReason:
        typeof value?.selectionReason === 'string' && value.selectionReason.trim().length > 0
          ? value.selectionReason.trim()
          : null,
      conflictInfo: this.normalizeConflictInfo(value?.conflictInfo ?? null),
    };
  }

  private normalizeSyncNowResult(value: DTO.SyncNowResultDto): SyncNowResultDto {
    return {
      pulled: Boolean(value?.pulled),
      pushed: Boolean(value?.pushed),
      skipped: Array.isArray(value?.skipped)
        ? value.skipped
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
        : undefined,
      pullResult: value?.pullResult ? this.normalizeActionResult(value.pullResult) : null,
      pushResult: value?.pushResult ? this.normalizeActionResult(value.pushResult) : null,
    };
  }

  private normalizeSnapshotInfo(value: DTO.SyncSnapshotInfoDto): SyncSnapshotInfoDto {
    return {
      snapshotId: String(value?.snapshotId ?? ''),
      fileName: String(value?.fileName ?? ''),
      snapshotFilePath: String(value?.snapshotFilePath ?? ''),
      fullPath: String(value?.fullPath ?? ''),
      sidecarPath: String(value?.sidecarPath ?? ''),
      sidecarFileName: String(value?.sidecarFileName ?? ''),
      createdAtMs: this.normalizeIntegerOrNull(value?.createdAtMs) ?? Date.now(),
      sizeBytes: Math.max(0, Number(value?.sizeBytes ?? 0)),
      repoId: String(value?.repoId ?? ''),
      deviceId: String(value?.deviceId ?? ''),
      meta: value?.meta ?? null,
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

  private toErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message.trim();
    }

    return fallbackMessage;
  }

  private async refreshSettingsAndState(): Promise<void> {
    await Promise.all([
      firstValueFrom(this.getSettings()),
      firstValueFrom(this.getState()),
    ]).catch(() => undefined);
  }
}
