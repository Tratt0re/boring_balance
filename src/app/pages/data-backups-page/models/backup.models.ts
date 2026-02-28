import type * as DTO from '@/dtos';

export type BackupSettingsDto = DTO.BackupSettingsDto;
export type BackupStateDto = DTO.BackupStateDto;
export type BackupFileInfoDto = DTO.BackupFileInfoDto;
export type CreateBackupResultDto = DTO.CreateBackupResultDto;
export type RestoreBackupResultDto = DTO.RestoreBackupResultDto;
export type BackupRemoveResponseDto = DTO.BackupRemoveResponseDto;

export const BACKUP_AUTO_INTERVAL_OPTIONS = [0, 30, 60, 120] as const;
export const BACKUP_RETENTION_COUNT_OPTIONS = [1, 2, 3, 4, 5] as const;

export const BACKUP_SETTINGS_DEFAULTS: BackupSettingsDto = {
  enabled: false,
  folderPath: null,
  autoBackupOnQuit: true,
  autoBackupIntervalMin: BACKUP_AUTO_INTERVAL_OPTIONS[0],
  retentionCount: BACKUP_RETENTION_COUNT_OPTIONS[0],
};

export const BACKUP_STATE_DEFAULTS: BackupStateDto = {
  lastBackupAtMs: null,
  lastBackupFileName: null,
  lastBackupStatus: 'idle',
  lastBackupError: null,
  lastBackedUpChangeCounter: null,
};
