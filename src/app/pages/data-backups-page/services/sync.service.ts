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
import { BaseIpcService } from '@/services/base-ipc.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { reloadAppShell } from '@/shared/utils/reload-app-shell';
import { WindowService } from '@/services/window.service';
import {
  SYNC_SETTINGS_DEFAULTS,
  type RepoStatusDto,
  type SyncActionResultDto,
  type SyncAvailabilityDto,
  type SyncNowResultDto,
  type SyncSelectFolderResponseDto,
  type SyncSettingsDto,
  type SyncSnapshotInfoDto,
  type SyncStateDto,
} from '../models/sync.models';
import {
  normalizeActionResult,
  normalizeConflictInfo,
  normalizeRepoStatus,
  normalizeSettings,
  normalizeSnapshotInfo,
  normalizeState,
  normalizeSyncNowResult,
} from '../models/sync-normalizers';

@Injectable({
  providedIn: 'root',
})
export class SyncService extends BaseIpcService<APIChannel.SYNC> {
  private readonly localPreferencesService = inject(LocalPreferencesService);
  private readonly windowService = inject(WindowService);
  private readonly translateService = inject(TranslateService);
  private readonly settingsSubject = new BehaviorSubject<SyncSettingsDto>(SYNC_SETTINGS_DEFAULTS);
  private readonly stateSubject = new BehaviorSubject<SyncStateDto>(this.readPersistedState());
  private readonly snapshotsSubject = new BehaviorSubject<readonly SyncSnapshotInfoDto[]>([]);
  private readonly settingsLoadingSubject = new BehaviorSubject(false);
  private readonly stateLoadingSubject = new BehaviorSubject(false);
  private readonly repoStatusLoadingSubject = new BehaviorSubject(false);
  private readonly enableLoadingSubject = new BehaviorSubject(false);
  private readonly disableLoadingSubject = new BehaviorSubject(false);
  private readonly syncNowLoadingSubject = new BehaviorSubject(false);
  private readonly pullNowLoadingSubject = new BehaviorSubject(false);
  private readonly pushNowLoadingSubject = new BehaviorSubject(false);
  private readonly snapshotsLoadingSubject = new BehaviorSubject(false);
  private readonly setDefaultSnapshotLoadingSubject = new BehaviorSubject(false);
  private readonly removeSnapshotLoadingSubject = new BehaviorSubject(false);

  private eventsBound = false;
  private initializationPromise: Promise<void> | null = null;

  readonly settings$ = this.settingsSubject.asObservable();
  readonly state$ = this.stateSubject.asObservable();
  readonly snapshots$ = this.snapshotsSubject.asObservable();
  readonly settingsLoading$ = this.settingsLoadingSubject.asObservable();
  readonly stateLoading$ = this.stateLoadingSubject.asObservable();
  readonly repoStatusLoading$ = this.repoStatusLoadingSubject.asObservable();
  readonly enableLoading$ = this.enableLoadingSubject.asObservable();
  readonly disableLoading$ = this.disableLoadingSubject.asObservable();
  readonly syncNowLoading$ = this.syncNowLoadingSubject.asObservable();
  readonly pullNowLoading$ = this.pullNowLoadingSubject.asObservable();
  readonly pushNowLoading$ = this.pushNowLoadingSubject.asObservable();
  readonly snapshotsLoading$ = this.snapshotsLoadingSubject.asObservable();
  readonly setDefaultSnapshotLoading$ = this.setDefaultSnapshotLoadingSubject.asObservable();
  readonly removeSnapshotLoading$ = this.removeSnapshotLoadingSubject.asObservable();

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
      .then(([settings]) => {
        if (settings.enabled && settings.folderPath) {
          return firstValueFrom(this.listSnapshots()).then(() => undefined);
        }

        this.snapshotsSubject.next([]);
        return undefined;
      })
      .finally(() => {
        this.initializationPromise = null;
      });

    return from(this.initializationPromise);
  }

  getSettings(): Observable<SyncSettingsDto> {
    this.settingsLoadingSubject.next(true);

    return from(this.ipcClient.getSettings()).pipe(
      map((settings) => normalizeSettings(settings)),
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

  updateSettings(patch: DTO.SyncUpdateSettingsDto): Observable<SyncSettingsDto> {
    this.settingsLoadingSubject.next(true);

    return from(this.ipcClient.updateSettings(patch)).pipe(
      map((settings) => normalizeSettings(settings)),
      tap((settings) => {
        this.settingsSubject.next(settings);
      }),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('updateSettingsFailed')));
        return of(this.settingsSubject.value);
      }),
      finalize(() => this.settingsLoadingSubject.next(false)),
    );
  }

  getState(): Observable<SyncStateDto> {
    this.stateLoadingSubject.next(true);

    return from(this.ipcClient.getState()).pipe(
      map((state) => normalizeState(state, this.stateSubject.value)),
      tap((state) => {
        this.setState(state);
      }),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('loadStateFailed')));
        return of(this.stateSubject.value);
      }),
      finalize(() => this.stateLoadingSubject.next(false)),
    );
  }

  checkAvailability(): Observable<SyncAvailabilityDto> {
    return from(this.ipcClient.checkAvailability()).pipe(
      map((result) => ({
        hasNewerRemoteSnapshot: Boolean(result?.hasNewerRemoteSnapshot),
      })),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('checkNewerFailed')));
        return of({
          hasNewerRemoteSnapshot: false,
        });
      }),
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
        toast.error(this.toErrorMessage(error, this.text('selectFolderFailed')));
        return of(null);
      }),
    );
  }

  repoStatus(folderPath?: string): Observable<RepoStatusDto> {
    this.repoStatusLoadingSubject.next(true);

    const payload = folderPath ? { folderPath } : undefined;
    return from(this.ipcClient.repoStatus(payload)).pipe(
      map((result) => normalizeRepoStatus(result)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('inspectFolderFailed')));
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
        toast.success(this.text('enabled'));
        void this.refreshSettingsAndState();
      }),
      finalize(() => this.enableLoadingSubject.next(false)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('enableFailed')));
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
        toast.success(this.text('disabled'));
        void this.refreshSettingsAndState();
      }),
      finalize(() => this.disableLoadingSubject.next(false)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('disableFailed')));
        return throwError(() => error);
      }),
    );
  }

  syncNow(): Observable<SyncNowResultDto> {
    this.syncNowLoadingSubject.next(true);

    return from(this.ipcClient.syncNow()).pipe(
      map((result) => normalizeSyncNowResult(result)),
      tap((result) => {
        if (!result.pulled && !result.pushed) {
          toast.success(this.text('syncNothingChanged'));
        }
      }),
      finalize(() => this.syncNowLoadingSubject.next(false)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('syncFailed')));
        return throwError(() => error);
      }),
    );
  }

  pullNow(): Observable<SyncActionResultDto> {
    this.pullNowLoadingSubject.next(true);

    return from(this.ipcClient.pullNow()).pipe(
      map((result) => normalizeActionResult(result)),
      tap((result) => {
        if (result.action === 'skipped') {
          toast.success(result.reason ?? this.text('pullNothingNewer'));
        }
      }),
      finalize(() => this.pullNowLoadingSubject.next(false)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('pullFailed')));
        return throwError(() => error);
      }),
    );
  }

  pushNow(): Observable<SyncActionResultDto> {
    this.pushNowLoadingSubject.next(true);

    return from(this.ipcClient.pushNow()).pipe(
      map((result) => normalizeActionResult(result)),
      tap((result) => {
        if (result.action === 'skipped') {
          toast.success(result.reason ?? this.text('pushNothingToPublish'));
        }
      }),
      finalize(() => this.pushNowLoadingSubject.next(false)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('pushFailed')));
        return throwError(() => error);
      }),
    );
  }

  listSnapshots(): Observable<readonly SyncSnapshotInfoDto[]> {
    this.snapshotsLoadingSubject.next(true);

    return from(this.ipcClient.listSnapshots()).pipe(
      map((rows) =>
        [...rows]
          .map((row) => normalizeSnapshotInfo(row))
          .sort((left, right) => right.createdAtMs - left.createdAtMs),
      ),
      tap((rows) => {
        this.snapshotsSubject.next(rows);
      }),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('loadSnapshotsFailed')));
        return of(this.snapshotsSubject.value);
      }),
      finalize(() => this.snapshotsLoadingSubject.next(false)),
    );
  }

  setDefaultSnapshot(snapshotFilePath: string): Observable<SyncActionResultDto> {
    this.setDefaultSnapshotLoadingSubject.next(true);

    return from(this.ipcClient.setDefaultSnapshot({ snapshotFilePath })).pipe(
      map((result) => normalizeActionResult(result)),
      tap(() => {
        toast.success(this.text('defaultFileUpdated'));
        void firstValueFrom(this.listSnapshots());
        reloadAppShell(this.windowService, 250);
      }),
      finalize(() => this.setDefaultSnapshotLoadingSubject.next(false)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('selectDefaultFileFailed')));
        return throwError(() => error);
      }),
    );
  }

  removeSnapshot(snapshotFilePath: string): Observable<DTO.SyncRemoveSnapshotResponse> {
    this.removeSnapshotLoadingSubject.next(true);

    return from(this.ipcClient.removeSnapshot({ snapshotFilePath })).pipe(
      tap((result) => {
        if (Number(result?.changed ?? 0) > 0) {
          toast.success(this.text('fileDeleted'));
        }

        void firstValueFrom(this.listSnapshots());
      }),
      finalize(() => this.removeSnapshotLoadingSubject.next(false)),
      catchError((error) => {
        toast.error(this.toErrorMessage(error, this.text('deleteFileFailed')));
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
    onIpcEvent('sync:stateChanged', (payload) => {
      this.setState(payload as DTO.SyncStateDto);
    });

    onIpcEvent('sync:pullCompleted', (payload) => {
      const result = normalizeActionResult(payload as DTO.SyncActionResultDto);
      toast.success(
        result.snapshotId
          ? this.text('pullCompletedWithId', { snapshotId: result.snapshotId })
          : this.text('pullCompleted'),
      );
      void this.refreshSettingsAndState();
      reloadAppShell(this.windowService, 250);
    });

    onIpcEvent('sync:pullFailed', (payload) => {
      const errorMessage = this.extractErrorFromPayload(payload, this.text('pullFailed'));
      toast.error(errorMessage);
    });

    onIpcEvent('sync:pushCompleted', (payload) => {
      const result = normalizeActionResult(payload as DTO.SyncActionResultDto);
      toast.success(
        result.snapshotId
          ? this.text('pushCompletedWithId', { snapshotId: result.snapshotId })
          : this.text('pushCompleted'),
      );
      void this.refreshSettingsAndState();
    });

    onIpcEvent('sync:pushFailed', (payload) => {
      const errorMessage = this.extractErrorFromPayload(payload, this.text('pushFailed'));
      toast.error(errorMessage);
    });

    onIpcEvent('sync:conflictDetected', (payload) => {
      const conflictInfo = normalizeConflictInfo(payload as DTO.SyncConflictInfoDto | null);
      const currentState = this.stateSubject.value;

      this.setState({
        ...currentState,
        status: 'conflict',
        conflictInfo,
        lastError: conflictInfo?.reason ?? currentState.lastError,
      });
      toast.error(this.text('conflictDetected'));
      void this.refreshSettingsAndState();
      reloadAppShell(this.windowService, 250);
    });
  }

  private readPersistedState(): SyncStateDto {
    return normalizeState(this.localPreferencesService.getSyncState<DTO.SyncStateDto>());
  }

  private setState(value: DTO.SyncStateDto | SyncStateDto): void {
    const nextState = normalizeState(value, this.stateSubject.value);
    this.stateSubject.next(nextState);
    this.localPreferencesService.setSyncState(nextState);
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
    return this.translateService.instant(`dataBackups.toasts.sync.${key}`, params);
  }

  private toErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message.trim();
    }

    return fallbackMessage;
  }

  private async refreshSettingsAndState(): Promise<void> {
    const [settings] = await Promise.all([
      firstValueFrom(this.getSettings()),
      firstValueFrom(this.getState()),
    ]).catch(() => [this.settingsSubject.value, this.stateSubject.value] as const);

    if (settings.enabled && settings.folderPath) {
      await firstValueFrom(this.listSnapshots()).catch(() => undefined);
      return;
    }

    this.snapshotsSubject.next([]);
  }
}
