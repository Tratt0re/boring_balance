export interface SyncSettingsDto {
  readonly enabled: boolean;
  readonly folderPath?: string | null;
  readonly baseFolderPath: string | null;
  readonly repoFolderName: string;
  readonly repoPath: string | null;
  readonly deviceId: string;
  readonly deviceName?: string | null;
  readonly autoPullIntervalMin: number;
  readonly autoPushIntervalMin: number;
  readonly autoPushOnQuit: boolean;
  readonly retentionCountPerDevice: number;
  readonly lastSeenRemoteSnapshotId: string | null;
  readonly lastPublishedCounter?: number | null;
  readonly lastPublishedLocalCounter: number | null;
  readonly lastPulledCounter?: number | null;
  readonly lastError?: string | null;
}

export interface SyncConflictInfoDto {
  readonly localCopyPath: string | null;
  readonly remoteSnapshotPath: string;
  readonly reason: string;
}

export interface SyncRemoteLatestDto {
  readonly changeCounter: number;
  readonly lastWriteMs: number;
  readonly file: string;
}

export interface SyncStateDto {
  readonly status: 'idle' | 'running' | 'ok' | 'error' | 'conflict';
  readonly lastPullAtMs: number | null;
  readonly lastPushAtMs: number | null;
  readonly lastError: string | null;
  readonly remoteLatest?: SyncRemoteLatestDto | null;
  readonly conflictInfo?: SyncConflictInfoDto | null;
}

export interface SyncRepoMetaResponseDto {
  readonly repoId: string;
  readonly createdAtMs: number;
  readonly syncSchemaVersion: number;
  readonly appName?: string;
  readonly repoPath?: string;
  readonly repoFilePath?: string;
}

export interface SyncRepoStatusRequestDto {
  readonly folderPath?: string;
  readonly baseFolderPath?: string;
}

export interface SyncRepoStatusResponseDto {
  readonly exists: boolean;
  readonly repoPath: string | null;
  readonly repoMeta?: SyncRepoMetaResponseDto;
}

export interface SyncUpdateSettingsDto {
  readonly enabled?: boolean;
  readonly folderPath?: string | null;
  readonly baseFolderPath?: string | null;
  readonly repoFolderName?: string;
  readonly deviceName?: string | null;
  readonly autoPullIntervalMin?: number;
  readonly autoPushIntervalMin?: number;
  readonly autoPushOnQuit?: boolean;
  readonly retentionCountPerDevice?: number;
}

export interface SyncSelectFolderResponseDto {
  readonly folderPath: string;
}

export interface SyncEnableDto {
  readonly folderPath: string;
}

export interface SyncEnableResponseDto {
  readonly ok: boolean;
}

export interface SyncEnableCreateRepoDto {
  readonly baseFolderPath: string;
  readonly deviceName?: string | null;
}

export interface SyncEnableAttachRepoDto {
  readonly baseFolderPath: string;
}

export interface SyncEnableResultDto {
  readonly repoId: string;
  readonly repoPath: string;
  readonly actionTaken?: string;
}

export interface SyncSnapshotMetaDto {
  readonly repo_id?: string | null;
  readonly device_id?: string | null;
  readonly snapshot_created_ms?: number | null;
  readonly db_uuid?: string | null;
  readonly change_counter?: number | null;
  readonly last_write_ms?: number | null;
  readonly schema_version?: number | null;
  readonly app_version?: string | null;
  readonly checksum_sha256?: string | null;
}

export interface SyncActionPruneResultDto {
  readonly removed?: readonly unknown[];
  readonly kept?: number;
}

export interface SyncActionResultDto {
  readonly action: string;
  readonly reason?: string;
  readonly pulled?: boolean;
  readonly pushed?: boolean;
  readonly repoId?: string;
  readonly repoPath?: string;
  readonly snapshotId?: string;
  readonly snapshotFile?: string;
  readonly snapshotFilePath?: string;
  readonly remote?: SyncRemoteLatestDto;
  readonly restoredFrom?: string;
  readonly restoredTo?: string;
  readonly previousLocalCopyPath?: string | null;
  readonly restoredRemote?: boolean;
  readonly createdAtMs?: number;
  readonly sizeBytes?: number;
  readonly indexUpdated?: boolean;
  readonly selectionReason?: string;
  readonly meta?: SyncSnapshotMetaDto | null;
  readonly prune?: SyncActionPruneResultDto | null;
  readonly conflictInfo?: SyncConflictInfoDto | null;
}

export interface SyncNowResultDto {
  readonly pulled: boolean;
  readonly pushed: boolean;
  readonly skipped?: readonly string[];
  readonly pullResult?: SyncActionResultDto | null;
  readonly pushResult?: SyncActionResultDto | null;
}

export interface SyncDisableResponseDto {
  readonly ok: boolean;
}

export interface SyncSnapshotInfoDto {
  readonly snapshotId: string;
  readonly fileName: string;
  readonly snapshotFilePath: string;
  readonly fullPath: string;
  readonly sidecarPath: string;
  readonly sidecarFileName: string;
  readonly createdAtMs: number;
  readonly sizeBytes: number;
  readonly repoId: string;
  readonly deviceId: string;
  readonly meta?: SyncSnapshotMetaDto | null;
}

export type SyncGetSettingsResponse = SyncSettingsDto;
export type SyncUpdateSettingsResponse = SyncSettingsDto;
export type SyncGetStateResponse = SyncStateDto;
export type SyncSelectFolderResponse = SyncSelectFolderResponseDto | null;
export type SyncRepoStatusResponse = SyncRepoStatusResponseDto;
export type SyncEnableResponse = SyncEnableResponseDto;
export type SyncEnableCreateRepoResponse = SyncEnableResultDto;
export type SyncEnableAttachRepoResponse = SyncEnableResultDto;
export type SyncDisableResponse = SyncDisableResponseDto;
export type SyncRunNowResponse = SyncNowResultDto;
export type SyncPullNowResponse = SyncActionResultDto;
export type SyncPushNowResponse = SyncActionResultDto;
export type SyncListSnapshotsResponse = readonly SyncSnapshotInfoDto[];
