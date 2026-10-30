import type * as DTO from '@/dtos';

import {
  SYNC_INTERVAL_OPTIONS,
  SYNC_SETTINGS_DEFAULTS,
  SYNC_STATE_DEFAULTS,
  type RepoStatusDto,
  type SyncActionResultDto,
  type SyncNowResultDto,
  type SyncSettingsDto,
  type SyncSnapshotInfoDto,
  type SyncStateDto,
} from './sync.models';

export function normalizeSettings(value: DTO.SyncSettingsDto): SyncSettingsDto {
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
      typeof value?.repoPath === 'string' && value.repoPath.trim().length > 0
        ? value.repoPath.trim()
        : null,
    deviceId:
      typeof value?.deviceId === 'string' && value.deviceId.trim().length > 0
        ? value.deviceId.trim()
        : '',
    deviceName:
      typeof value?.deviceName === 'string' && value.deviceName.trim().length > 0
        ? value.deviceName.trim()
        : null,
    autoPullIntervalMin:
      Number.isInteger(autoPullIntervalMin) &&
      SYNC_INTERVAL_OPTIONS.includes(autoPullIntervalMin as (typeof SYNC_INTERVAL_OPTIONS)[number])
        ? autoPullIntervalMin
        : SYNC_SETTINGS_DEFAULTS.autoPullIntervalMin,
    autoPushIntervalMin:
      Number.isInteger(autoPushIntervalMin) &&
      SYNC_INTERVAL_OPTIONS.includes(autoPushIntervalMin as (typeof SYNC_INTERVAL_OPTIONS)[number])
        ? autoPushIntervalMin
        : SYNC_SETTINGS_DEFAULTS.autoPushIntervalMin,
    autoPushOnQuit: Boolean(value?.autoPushOnQuit),
    retentionCountPerDevice:
      Number.isInteger(retentionCountPerDevice) && retentionCountPerDevice > 0
        ? retentionCountPerDevice
        : SYNC_SETTINGS_DEFAULTS.retentionCountPerDevice,
    lastSeenRemoteSnapshotId:
      typeof value?.lastSeenRemoteSnapshotId === 'string' &&
      value.lastSeenRemoteSnapshotId.trim().length > 0
        ? value.lastSeenRemoteSnapshotId.trim()
        : null,
    lastPublishedCounter: normalizeIntegerOrNull(
      value?.lastPublishedCounter ?? value?.lastPublishedLocalCounter,
    ),
    lastPublishedLocalCounter: normalizeIntegerOrNull(value?.lastPublishedLocalCounter),
    lastPulledCounter: normalizeIntegerOrNull(value?.lastPulledCounter),
    lastError:
      typeof value?.lastError === 'string' && value.lastError.trim().length > 0
        ? value.lastError.trim()
        : null,
  };
}

export function normalizeState(
  value: DTO.SyncStateDto | null | undefined,
  fallbackState: SyncStateDto = SYNC_STATE_DEFAULTS,
): SyncStateDto {
  const status = value?.status;
  const normalizedStatus =
    status === 'idle' ||
    status === 'running' ||
    status === 'ok' ||
    status === 'error' ||
    status === 'conflict'
      ? status
      : SYNC_STATE_DEFAULTS.status;
  const preservePreviousStatus = normalizedStatus === 'idle' && fallbackState.status !== 'idle';
  const effectiveStatus = preservePreviousStatus ? fallbackState.status : normalizedStatus;
  const normalizedLastError =
    typeof value?.lastError === 'string' && value.lastError.trim().length > 0
      ? value.lastError.trim()
      : null;

  return {
    status: effectiveStatus,
    lastPullAtMs: normalizeIntegerOrNull(value?.lastPullAtMs) ?? fallbackState.lastPullAtMs,
    lastPushAtMs: normalizeIntegerOrNull(value?.lastPushAtMs) ?? fallbackState.lastPushAtMs,
    lastError:
      normalizedLastError ??
      (effectiveStatus === 'error' || effectiveStatus === 'conflict'
        ? fallbackState.lastError
        : null),
    remoteLatest: normalizeRemoteLatest(value?.remoteLatest ?? null) ?? fallbackState.remoteLatest,
    conflictInfo:
      normalizeConflictInfo(value?.conflictInfo ?? null) ??
      (effectiveStatus === 'conflict' ? fallbackState.conflictInfo : null),
  };
}

export function normalizeConflictInfo(
  value: DTO.SyncConflictInfoDto | null | undefined,
): DTO.SyncConflictInfoDto | null {
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

export function normalizeRemoteLatest(
  value: DTO.SyncRemoteLatestDto | null | undefined,
): DTO.SyncRemoteLatestDto | null {
  if (!value) {
    return null;
  }

  const changeCounter = normalizeIntegerOrNull(value.changeCounter);
  const lastWriteMs = normalizeIntegerOrNull(value.lastWriteMs);
  const file =
    typeof value.file === 'string' && value.file.trim().length > 0 ? value.file.trim() : null;

  if (changeCounter === null || lastWriteMs === null || !file) {
    return null;
  }

  return {
    changeCounter,
    lastWriteMs,
    file,
  };
}

export function normalizeRepoStatus(value: DTO.SyncRepoStatusResponse): RepoStatusDto {
  const repoMeta = value?.repoMeta;
  const normalizedRepoMeta =
    repoMeta &&
    typeof repoMeta.repoId === 'string' &&
    repoMeta.repoId.trim().length > 0 &&
    Number.isInteger(normalizeIntegerOrNull(repoMeta.createdAtMs)) &&
    Number.isInteger(normalizeIntegerOrNull(repoMeta.syncSchemaVersion))
      ? {
          repo_id: repoMeta.repoId.trim(),
          created_at_ms: normalizeIntegerOrNull(repoMeta.createdAtMs) ?? Date.now(),
          sync_schema_version: normalizeIntegerOrNull(repoMeta.syncSchemaVersion) ?? 0,
        }
      : undefined;

  return {
    exists: Boolean(value?.exists),
    repoPath:
      typeof value?.repoPath === 'string' && value.repoPath.trim().length > 0
        ? value.repoPath.trim()
        : null,
    repoMeta: normalizedRepoMeta,
  };
}

export function normalizeActionResult(value: DTO.SyncActionResultDto): SyncActionResultDto {
  return {
    action: String(value?.action ?? ''),
    reason:
      typeof value?.reason === 'string' && value.reason.trim().length > 0
        ? value.reason.trim()
        : null,
    pulled: typeof value?.pulled === 'boolean' ? value.pulled : undefined,
    pushed: typeof value?.pushed === 'boolean' ? value.pushed : undefined,
    repoId:
      typeof value?.repoId === 'string' && value.repoId.trim().length > 0
        ? value.repoId.trim()
        : null,
    repoPath:
      typeof value?.repoPath === 'string' && value.repoPath.trim().length > 0
        ? value.repoPath.trim()
        : null,
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
    remote: normalizeRemoteLatest(value?.remote ?? null),
    restoredFrom:
      typeof value?.restoredFrom === 'string' && value.restoredFrom.trim().length > 0
        ? value.restoredFrom.trim()
        : null,
    restoredTo:
      typeof value?.restoredTo === 'string' && value.restoredTo.trim().length > 0
        ? value.restoredTo.trim()
        : null,
    previousLocalCopyPath:
      typeof value?.previousLocalCopyPath === 'string' &&
      value.previousLocalCopyPath.trim().length > 0
        ? value.previousLocalCopyPath.trim()
        : null,
    restoredRemote: typeof value?.restoredRemote === 'boolean' ? value.restoredRemote : undefined,
    createdAtMs: normalizeIntegerOrNull(value?.createdAtMs),
    sizeBytes: normalizeIntegerOrNull(value?.sizeBytes),
    indexUpdated: typeof value?.indexUpdated === 'boolean' ? value.indexUpdated : undefined,
    selectionReason:
      typeof value?.selectionReason === 'string' && value.selectionReason.trim().length > 0
        ? value.selectionReason.trim()
        : null,
    conflictInfo: normalizeConflictInfo(value?.conflictInfo ?? null),
  };
}

export function normalizeSyncNowResult(value: DTO.SyncNowResultDto): SyncNowResultDto {
  return {
    pulled: Boolean(value?.pulled),
    pushed: Boolean(value?.pushed),
    skipped: Array.isArray(value?.skipped)
      ? value.skipped
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      : undefined,
    pullResult: value?.pullResult ? normalizeActionResult(value.pullResult) : null,
    pushResult: value?.pushResult ? normalizeActionResult(value.pushResult) : null,
  };
}

export function normalizeSnapshotInfo(value: DTO.SyncSnapshotInfoDto): SyncSnapshotInfoDto {
  return {
    snapshotId: String(value?.snapshotId ?? ''),
    fileName: String(value?.fileName ?? ''),
    snapshotFilePath: String(value?.snapshotFilePath ?? ''),
    fullPath: String(value?.fullPath ?? ''),
    sidecarPath: String(value?.sidecarPath ?? ''),
    sidecarFileName: String(value?.sidecarFileName ?? ''),
    createdAtMs: normalizeIntegerOrNull(value?.createdAtMs) ?? Date.now(),
    sizeBytes: Math.max(0, Number(value?.sizeBytes ?? 0)),
    repoId: String(value?.repoId ?? ''),
    deviceId: String(value?.deviceId ?? ''),
    isDefault: Boolean(value?.isDefault),
    meta: value?.meta ?? null,
  };
}

export function normalizeIntegerOrNull(value: unknown): number | null {
  const normalizedValue = Number(value);
  return Number.isInteger(normalizedValue) ? normalizedValue : null;
}
