import type * as DTO from '@/dtos';

export interface RepoMetaDto {
  readonly repo_id: string;
  readonly created_at_ms: number;
  readonly sync_schema_version: number;
}

export interface RepoStatusDto {
  readonly exists: boolean;
  readonly repoPath: string | null;
  readonly repoMeta?: RepoMetaDto;
}

export type SyncConflictInfoDto = DTO.SyncConflictInfoDto;
export type SyncSettingsDto = DTO.SyncSettingsDto;
export type SyncStateDto = DTO.SyncStateDto;
export type SyncSelectFolderResponseDto = DTO.SyncSelectFolderResponseDto;
export type EnableSyncResultDto = DTO.SyncEnableResultDto;

export interface SyncActionResultDto {
  readonly action: string;
  readonly reason?: string | null;
  readonly repoId?: string | null;
  readonly repoPath?: string | null;
  readonly snapshotId?: string | null;
  readonly snapshotFilePath?: string | null;
  readonly restoredFrom?: string | null;
  readonly restoredTo?: string | null;
  readonly previousLocalCopyPath?: string | null;
  readonly restoredRemote?: boolean;
  readonly createdAtMs?: number | null;
  readonly sizeBytes?: number | null;
  readonly selectionReason?: string | null;
  readonly conflictInfo?: SyncConflictInfoDto | null;
}

export interface SyncNowResultDto {
  readonly pulled: boolean;
  readonly pushed: boolean;
  readonly skipped: boolean;
  readonly pullResult?: SyncActionResultDto | null;
  readonly pushResult?: SyncActionResultDto | null;
}

export type SyncSnapshotInfoDto = DTO.SyncSnapshotInfoDto;

export const SYNC_INTERVAL_OPTIONS = [0, 5, 15, 30, 60] as const;
export const SYNC_RETENTION_COUNT_OPTIONS = [1, 2, 3, 5, 10] as const;

export const SYNC_SETTINGS_DEFAULTS: SyncSettingsDto = {
  enabled: false,
  baseFolderPath: null,
  repoFolderName: 'BoringBalance.sync',
  repoPath: null,
  deviceId: '',
  deviceName: null,
  autoPullIntervalMin: SYNC_INTERVAL_OPTIONS[0],
  autoPushIntervalMin: SYNC_INTERVAL_OPTIONS[0],
  autoPushOnQuit: true,
  retentionCountPerDevice: 3,
  lastSeenRemoteSnapshotId: null,
  lastPublishedLocalCounter: null,
};

export const SYNC_STATE_DEFAULTS: SyncStateDto = {
  status: 'idle',
  lastPullAtMs: null,
  lastPushAtMs: null,
  lastError: null,
  conflictInfo: null,
};
