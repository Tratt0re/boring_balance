import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

import { AppDataTableComponent, type TableDataItem } from '@/components/data-table';
import type * as DTO from '@/dtos';
import {
  SYNC_INTERVAL_OPTIONS,
  SYNC_SETTINGS_DEFAULTS,
  SYNC_STATE_DEFAULTS,
  type RepoStatusDto,
  type SyncStateDto,
} from '@/pages/data-backups-page/models/sync.models';
import { SyncService } from '@/pages/data-backups-page/services/sync.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardLoaderComponent } from '@/shared/components/loader';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSwitchComponent } from '@/shared/components/switch';
import { ZardTooltipImports } from '@/shared/components/tooltip';

interface SelectOption {
  readonly value: string;
  readonly label: string;
}

interface StatusRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

const SYNC_INTERVAL_SELECT_OPTIONS: readonly SelectOption[] = [
  { value: '0', label: 'dataBackups.sync.autoSync.intervalOptions.off' },
  { value: '5', label: 'dataBackups.sync.autoSync.intervalOptions.minutes5' },
  { value: '10', label: 'dataBackups.sync.autoSync.intervalOptions.minutes10' },
  { value: '15', label: 'dataBackups.sync.autoSync.intervalOptions.minutes15' },
  { value: '30', label: 'dataBackups.sync.autoSync.intervalOptions.minutes30' },
  { value: '60', label: 'dataBackups.sync.autoSync.intervalOptions.minutes60' },
] as const;

const SYNC_STATUS_TABLE_STRUCTURE: readonly TableDataItem[] = [
  {
    columnName: 'dataBackups.sync.status.columns.item',
    columnKey: 'label',
    type: 'string',
  },
  {
    columnName: 'dataBackups.sync.status.columns.value',
    columnKey: 'value',
    type: 'string',
  },
] as const;

@Component({
  selector: 'app-sync-section',
  imports: [
    AppDataTableComponent,
    TranslatePipe,
    ZardButtonComponent,
    ZardLoaderComponent,
    ZardSwitchComponent,
    ...ZardTooltipImports,
    ...ZardSelectImports,
  ],
  templateUrl: './sync-section.component.html',
  styleUrl: './sync-section.component.scss',
})
export class SyncSectionComponent implements OnInit, OnDestroy {
  private readonly syncService = inject(SyncService);
  private readonly alertDialogService = inject(ZardAlertDialogService);
  private readonly translateService = inject(TranslateService);

  private settingsPatchTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;
  private pendingSettingsPatch: DTO.SyncUpdateSettingsDto = {};

  protected readonly settings = toSignal(this.syncService.settings$, {
    initialValue: SYNC_SETTINGS_DEFAULTS,
  });
  protected readonly state = toSignal(this.syncService.state$, {
    initialValue: SYNC_STATE_DEFAULTS,
  });
  protected readonly settingsLoading = toSignal(this.syncService.settingsLoading$, {
    initialValue: false,
  });
  protected readonly repoStatusLoading = toSignal(this.syncService.repoStatusLoading$, {
    initialValue: false,
  });
  protected readonly enableLoading = toSignal(this.syncService.enableLoading$, {
    initialValue: false,
  });
  protected readonly disableLoading = toSignal(this.syncService.disableLoading$, {
    initialValue: false,
  });
  protected readonly syncNowLoading = toSignal(this.syncService.syncNowLoading$, {
    initialValue: false,
  });
  protected readonly pullNowLoading = toSignal(this.syncService.pullNowLoading$, {
    initialValue: false,
  });
  protected readonly pushNowLoading = toSignal(this.syncService.pushNowLoading$, {
    initialValue: false,
  });

  protected readonly selectedFolderPath = signal<string | null>(null);
  protected readonly selectedRepoStatus = signal<RepoStatusDto | null>(null);
  protected readonly setupModeEnabled = signal(false);

  protected readonly intervalOptions = SYNC_INTERVAL_SELECT_OPTIONS;
  protected readonly statusTableStructure = SYNC_STATUS_TABLE_STRUCTURE;
  protected readonly syncModeEnabled = computed(() => this.settings().enabled || this.setupModeEnabled());

  protected readonly autoPullIntervalValue = computed(() =>
    String(this.normalizeIntervalOption(this.settings().autoPullIntervalMin)),
  );
  protected readonly autoPushIntervalValue = computed(() =>
    String(this.normalizeIntervalOption(this.settings().autoPushIntervalMin)),
  );
  protected readonly isBusy = computed(
    () =>
      this.state().status === 'running'
      || this.settingsLoading()
      || this.repoStatusLoading()
      || this.enableLoading()
      || this.disableLoading()
      || this.syncNowLoading()
      || this.pullNowLoading()
      || this.pushNowLoading(),
  );
  protected readonly canChooseFolder = computed(
    () => this.syncModeEnabled() && !this.settings().enabled && !this.isBusy(),
  );
  protected readonly showSetupSection = computed(() => !this.settings().enabled && this.syncModeEnabled());
  protected readonly showDisabledInfo = computed(() => !this.settings().enabled && !this.syncModeEnabled());
  protected readonly canEnableSelectedFolder = computed(
    () =>
      this.showSetupSection()
      && !this.isBusy()
      && !this.repoStatusLoading()
      && Boolean(this.selectedFolderPath())
      && this.selectedRepoStatus() !== null
      && typeof this.selectedRepoStatus()?.exists === 'boolean',
  );
  protected readonly canRunManualActions = computed(() => this.settings().enabled && !this.isBusy());
  protected readonly hasConflict = computed(
    () => this.state().status === 'conflict' && Boolean(this.state().conflictInfo),
  );
  protected readonly showLastError = computed(
    () => Boolean(this.state().lastError) && this.state().status !== 'conflict',
  );
  protected readonly statusRows = computed<readonly StatusRow[]>(() => [
    {
      id: 'current-status',
      label: 'dataBackups.sync.status.rows.current',
      value: this.statusLabel(this.state().status),
    },
    {
      id: 'last-pull',
      label: 'dataBackups.sync.status.rows.lastPull',
      value: this.formatLastPullTimestamp(this.state().lastPullAtMs),
    },
    {
      id: 'last-push',
      label: 'dataBackups.sync.status.rows.lastPush',
      value: this.formatTimestamp(this.state().lastPushAtMs),
    },
  ]);

  ngOnInit(): void {
    void firstValueFrom(this.syncService.initialize());
  }

  ngOnDestroy(): void {
    this.clearPendingSettingsPatch();
  }

  protected onEnabledChange(enabled: boolean): void {
    if (enabled) {
      if (!this.settings().enabled) {
        this.setupModeEnabled.set(true);
      }
      return;
    }

    if (!this.settings().enabled || this.isBusy()) {
      this.resetPendingSelection(true);
      return;
    }

    this.clearPendingSettingsPatch();
    void firstValueFrom(this.syncService.disable())
      .then(() => {
        this.resetPendingSelection(true);
      })
      .catch(() => undefined);
  }

  protected onChooseFolder(): void {
    if (!this.canChooseFolder()) {
      return;
    }

    void firstValueFrom(this.syncService.selectFolder()).then((result) => {
      if (!result?.folderPath) {
        return;
      }

      this.selectedFolderPath.set(result.folderPath);
      this.selectedRepoStatus.set(null);
      void this.loadRepoStatus(result.folderPath);
    });
  }

  protected onEnableSync(): void {
    const folderPath = this.selectedFolderPath();
    if (!folderPath || !this.canEnableSelectedFolder()) {
      return;
    }

    if (this.selectedRepoStatus()?.exists) {
      this.alertDialogService.confirm({
        zTitle: this.translateService.instant('dataBackups.sync.attachAlert.title'),
        zDescription: this.translateService.instant('dataBackups.sync.attachAlert.description'),
        zOkText: this.translateService.instant('dataBackups.sync.attachAlert.actions.attach'),
        zCancelText: this.translateService.instant('dataBackups.sync.attachAlert.actions.cancel'),
        zOkDestructive: true,
        zMaskClosable: true,
        zClosable: true,
        zOnOk: () => {
          this.runEnable(folderPath);
        },
      });
      return;
    }

    this.runEnable(folderPath);
  }

  protected onAutoPullIntervalChange(value: string | string[]): void {
    const selectionValue = this.extractSelectionValue(value);
    if (selectionValue === null || !this.settings().enabled) {
      return;
    }

    const parsedValue = Number.parseInt(selectionValue, 10);
    if (!Number.isInteger(parsedValue)) {
      return;
    }

    this.queueSettingsPatch({
      autoPullIntervalMin: this.normalizeIntervalOption(parsedValue),
    });
  }

  protected onAutoPushIntervalChange(value: string | string[]): void {
    const selectionValue = this.extractSelectionValue(value);
    if (selectionValue === null || !this.settings().enabled) {
      return;
    }

    const parsedValue = Number.parseInt(selectionValue, 10);
    if (!Number.isInteger(parsedValue)) {
      return;
    }

    this.queueSettingsPatch({
      autoPushIntervalMin: this.normalizeIntervalOption(parsedValue),
    });
  }

  protected onAutoPushOnQuitChange(autoPushOnQuit: boolean): void {
    if (!this.settings().enabled) {
      return;
    }

    this.queueSettingsPatch({ autoPushOnQuit });
  }

  protected onSyncNow(): void {
    if (!this.canRunManualActions()) {
      return;
    }

    void firstValueFrom(this.syncService.syncNow()).catch(() => undefined);
  }

  protected onPullNow(): void {
    if (!this.canRunManualActions()) {
      return;
    }

    void firstValueFrom(this.syncService.pullNow()).catch(() => undefined);
  }

  protected onPushNow(): void {
    if (!this.canRunManualActions()) {
      return;
    }

    void firstValueFrom(this.syncService.pushNow()).catch(() => undefined);
  }

  protected statusLabel(status: SyncStateDto['status']): string {
    const keyByStatus = {
      idle: 'dataBackups.sync.status.values.idle',
      running: 'dataBackups.sync.status.values.running',
      ok: 'dataBackups.sync.status.values.ok',
      error: 'dataBackups.sync.status.values.error',
      conflict: 'dataBackups.sync.status.values.conflict',
    } as const;

    return this.translateService.instant(keyByStatus[status]);
  }

  protected setupStatusMessage(): string {
    if (this.repoStatusLoading()) {
      return this.translateService.instant('dataBackups.sync.setup.status.checking');
    }

    const repoStatus = this.selectedRepoStatus();
    if (!repoStatus) {
      return this.translateService.instant('dataBackups.sync.setup.status.chooseFirst');
    }

    return this.translateService.instant(
      repoStatus.exists
        ? 'dataBackups.sync.setup.status.exists'
        : 'dataBackups.sync.setup.status.missing',
    );
  }

  protected setupRepoPath(): string {
    if (this.selectedRepoStatus()?.repoPath) {
      return this.selectedRepoStatus()?.repoPath ?? '';
    }

    const folderPath = this.selectedFolderPath();
    if (!folderPath) {
      return this.translateService.instant('dataBackups.sync.setup.status.repoPathPending');
    }

    return this.joinFolderPreview(folderPath, this.settings().repoFolderName);
  }

  private async loadRepoStatus(folderPath: string): Promise<void> {
    const repoStatus = await firstValueFrom(this.syncService.repoStatus(folderPath)).catch(() => null);
    if (!repoStatus || this.selectedFolderPath() !== folderPath) {
      return;
    }

    this.selectedRepoStatus.set(repoStatus);
  }

  private resetPendingSelection(resetSetupMode = false): void {
    this.selectedFolderPath.set(null);
    this.selectedRepoStatus.set(null);

    if (resetSetupMode) {
      this.setupModeEnabled.set(false);
    }
  }

  private queueSettingsPatch(patch: DTO.SyncUpdateSettingsDto): void {
    this.pendingSettingsPatch = {
      ...this.pendingSettingsPatch,
      ...patch,
    };

    if (this.settingsPatchTimeout !== null) {
      globalThis.clearTimeout(this.settingsPatchTimeout);
    }

    this.settingsPatchTimeout = globalThis.setTimeout(() => {
      const nextPatch = this.pendingSettingsPatch;
      this.pendingSettingsPatch = {};
      this.settingsPatchTimeout = null;

      void firstValueFrom(this.syncService.updateSettings(nextPatch));
    }, 250);
  }

  private clearPendingSettingsPatch(): void {
    if (this.settingsPatchTimeout !== null) {
      globalThis.clearTimeout(this.settingsPatchTimeout);
      this.settingsPatchTimeout = null;
    }

    this.pendingSettingsPatch = {};
  }

  private extractSelectionValue(value: string | string[]): string | null {
    if (Array.isArray(value)) {
      return null;
    }

    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : null;
  }

  private normalizeIntervalOption(value: number): number {
    const normalizedValue = Math.trunc(Number(value));
    return SYNC_INTERVAL_OPTIONS.includes(normalizedValue as (typeof SYNC_INTERVAL_OPTIONS)[number])
      ? normalizedValue
      : SYNC_INTERVAL_OPTIONS[0];
  }

  private formatLastPullTimestamp(value: number | null): string {
    const normalizedValue = this.normalizeTimestampValue(value);
    if (normalizedValue === null) {
      return this.translateService.instant('dataBackups.sync.status.values.noLastPull');
    }

    return this.formatTimestamp(normalizedValue);
  }

  private formatTimestamp(value: number | null): string {
    const normalizedValue = this.normalizeTimestampValue(value);
    if (normalizedValue === null) {
      return this.translateService.instant('dataBackups.sync.status.values.never');
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(normalizedValue));
  }

  private normalizeTimestampValue(value: number | null): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
  }

  private runEnable(folderPath: string): void {
    void firstValueFrom(this.syncService.enable(folderPath))
      .then(() => {
        this.resetPendingSelection(true);
      })
      .catch(() => undefined);
  }

  private joinFolderPreview(folderPath: string, childName: string): string {
    const normalizedFolderPath = folderPath.trim();
    const separator = normalizedFolderPath.includes('\\') ? '\\' : '/';

    if (normalizedFolderPath.endsWith('/') || normalizedFolderPath.endsWith('\\')) {
      return `${normalizedFolderPath}${childName}`;
    }

    return `${normalizedFolderPath}${separator}${childName}`;
  }
}
