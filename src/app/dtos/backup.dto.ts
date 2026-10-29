export interface BackupSettingsDto {
  readonly enabled: boolean;
  readonly folderPath: string | null;
  readonly autoBackupOnQuit: boolean;
  readonly autoBackupIntervalMin: number;
  readonly retentionCount: number;
}

export interface BackupStateDto {
  readonly lastBackupAtMs: number | null;
  readonly lastBackupFileName: string | null;
  readonly lastBackupStatus: 'idle' | 'running' | 'ok' | 'error';
  readonly lastBackupError: string | null;
  /** Set when a backup succeeded but old backups could not be removed. The new backup is still good. */
  readonly lastCleanupWarning: string | null;
  /** Set when automatic backup is on but cannot run, for example because no folder is chosen. */
  readonly configurationWarning: string | null;
  readonly lastBackedUpChangeCounter: number | null;
}

export interface BackupFileMetaDto {
  readonly created_at_ms?: number | null;
  readonly app_version?: string | null;
  readonly schema_version?: number | null;
  readonly db_uuid?: string | null;
  readonly change_counter?: number | null;
  readonly last_write_ms?: number | null;
}

export interface BackupFileInfoDto {
  readonly fileName: string;
  readonly fullPath: string;
  readonly createdAtMs: number;
  readonly sizeBytes: number;
  readonly meta?: BackupFileMetaDto | null;
}

export interface CreateBackupResultDto {
  readonly fileName: string;
  readonly fullPath: string;
  readonly createdAtMs: number;
  readonly sizeBytes?: number;
  readonly meta?: BackupFileMetaDto | null;
}

export interface RestoreBackupResultDto {
  readonly restoredFrom: string;
  readonly restoredTo: string;
  readonly previousLocalCopyPath: string | null;
}

export interface BackupUpdateSettingsDto {
  readonly enabled?: boolean;
  readonly folderPath?: string | null;
  readonly autoBackupOnQuit?: boolean;
  readonly autoBackupIntervalMin?: number;
  readonly retentionCount?: number;
}

export interface BackupRestoreDto {
  readonly backupFilePath: string;
}

export interface BackupRemoveDto {
  readonly backupFilePath: string;
}

export interface BackupSelectFolderResponseDto {
  readonly folderPath: string;
}

export interface BackupSelectRestoreFileResponseDto {
  readonly filePath: string;
  readonly fileName: string;
}

export interface BackupRemoveResponseDto {
  readonly changed: number;
}

export type BackupGetSettingsResponse = BackupSettingsDto;
export type BackupUpdateSettingsResponse = BackupSettingsDto;
export type BackupGetStateResponse = BackupStateDto;
export type BackupSelectFolderResponse = BackupSelectFolderResponseDto | null;
export type BackupSelectRestoreFileResponse = BackupSelectRestoreFileResponseDto | null;
export type BackupListResponse = readonly BackupFileInfoDto[];
export type BackupRunNowResponse = CreateBackupResultDto;
export type BackupRestoreResponse = RestoreBackupResultDto;
export type BackupRemoveResponse = BackupRemoveResponseDto;
