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
export type SyncRemoteLatestDto = DTO.SyncRemoteLatestDto;
export type SyncSettingsDto = DTO.SyncSettingsDto;
export type SyncStateDto = DTO.SyncStateDto;
export type SyncSelectFolderResponseDto = DTO.SyncSelectFolderResponseDto;
export type EnableSyncResultDto = DTO.SyncEnableResultDto;

export interface SyncActionResultDto {
  readonly action: string;
  readonly reason?: string | null;
  readonly pulled?: boolean;
  readonly pushed?: boolean;
  readonly repoId?: string | null;
  readonly repoPath?: string | null;
  readonly snapshotId?: string | null;
  readonly snapshotFile?: string | null;
  readonly snapshotFilePath?: string | null;
  readonly remote?: SyncRemoteLatestDto | null;
  readonly restoredFrom?: string | null;
  readonly restoredTo?: string | null;
  readonly previousLocalCopyPath?: string | null;
  readonly restoredRemote?: boolean;
  readonly createdAtMs?: number | null;
  readonly sizeBytes?: number | null;
  readonly indexUpdated?: boolean;
  readonly selectionReason?: string | null;
  readonly conflictInfo?: SyncConflictInfoDto | null;
}

export interface SyncNowResultDto {
  readonly pulled: boolean;
  readonly pushed: boolean;
  readonly skipped?: readonly string[];
  readonly pullResult?: SyncActionResultDto | null;
  readonly pushResult?: SyncActionResultDto | null;
}

export type SyncSnapshotInfoDto = DTO.SyncSnapshotInfoDto;

export const SYNC_INTERVAL_OPTIONS = [0, 5, 10, 15, 30, 60] as const;
export const SYNC_RETENTION_COUNT_OPTIONS = [1, 2, 3, 5, 10] as const;

export const SYNC_SETTINGS_DEFAULTS: SyncSettingsDto = {
  enabled: false,
  folderPath: null,
  baseFolderPath: null,
  repoFolderName: 'boring-balance.sync',
  repoPath: null,
  deviceId: '',
  deviceName: null,
  autoPullIntervalMin: 10,
  autoPushIntervalMin: 30,
  autoPushOnQuit: true,
  retentionCountPerDevice: 1,
  lastSeenRemoteSnapshotId: null,
  lastPublishedCounter: null,
  lastPublishedLocalCounter: null,
  lastPulledCounter: null,
  lastError: null,
};

export const SYNC_STATE_DEFAULTS: SyncStateDto = {
  status: 'idle',
  lastPullAtMs: null,
  lastPushAtMs: null,
  lastError: null,
  remoteLatest: null,
  conflictInfo: null,
};
