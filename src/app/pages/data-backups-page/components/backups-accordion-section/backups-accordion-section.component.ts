import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

import { AppDataTableComponent, type TableDataItem } from '@/components/data-table';
import { BackupService } from '@/services/backup.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardLoaderComponent } from '@/shared/components/loader';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSwitchComponent } from '@/shared/components/switch';
import {
  BACKUP_AUTO_INTERVAL_OPTIONS,
  BACKUP_RETENTION_COUNT_OPTIONS,
  BACKUP_SETTINGS_DEFAULTS,
  BACKUP_STATE_DEFAULTS,
  type BackupFileInfoDto,
} from '../../models/backup.models';

interface BackupTableRow {
  readonly id: string;
  readonly fullPath: string;
  readonly createdAtMs: number;
  readonly fileName: string;
  readonly sizeLabel: string;
}

interface SelectOption {
  readonly value: string;
  readonly label: string;
}

const AUTO_BACKUP_INTERVAL_SELECT_OPTIONS: readonly SelectOption[] = [
  { value: '0', label: 'dataBackups.backups.autoBackup.intervalOptions.off' },
  { value: '30', label: 'dataBackups.backups.autoBackup.intervalOptions.minutes30' },
  { value: '60', label: 'dataBackups.backups.autoBackup.intervalOptions.minutes60' },
  { value: '120', label: 'dataBackups.backups.autoBackup.intervalOptions.minutes120' },
] as const;

const RETENTION_COUNT_SELECT_OPTIONS: readonly SelectOption[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
] as const;

const BACKUP_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'dataBackups.backups.list.columns.date',
    columnKey: 'createdAtMs',
    type: 'datetime',
    sortable: true,
  },
  {
    columnName: 'dataBackups.backups.list.columns.file',
    columnKey: 'fileName',
    type: 'string',
    sortable: true,
  },
  {
    columnName: 'dataBackups.backups.list.columns.size',
    columnKey: 'sizeLabel',
    type: 'string',
    sortable: true,
    align: 'right',
  },
] as const;

const createBackupsTableStructure = (
  onRestoreAction: (row: object) => void | Promise<void>,
  onDeleteAction: (row: object) => void | Promise<void>,
  isActionDisabled: () => boolean,
): readonly TableDataItem[] =>
  [
    ...BACKUP_TABLE_COLUMNS,
    {
      showLabel: false,
      actionItems: [
        {
          id: 'restore-backup',
          icon: 'arrow-left',
          label: 'dataBackups.backups.actions.restore',
          buttonType: 'ghost',
          disabled: () => isActionDisabled(),
          action: onRestoreAction,
        },
        {
          id: 'delete-backup',
          icon: 'trash',
          label: 'dataBackups.backups.actions.delete',
          buttonType: 'ghost',
          disabled: () => isActionDisabled(),
          action: onDeleteAction,
        },
      ],
    },
  ] as const;

@Component({
  selector: 'app-backups-accordion-section',
  imports: [
    DatePipe,
    AppDataTableComponent,
    TranslatePipe,
    ZardButtonComponent,
    ZardLoaderComponent,
    ZardSwitchComponent,
    ...ZardSelectImports,
  ],
  templateUrl: './backups-accordion-section.component.html',
})
export class BackupsAccordionSectionComponent implements OnInit {
  private readonly backupService = inject(BackupService);
  private readonly alertDialogService = inject(ZardAlertDialogService);
  private readonly translateService = inject(TranslateService);

  protected readonly settings = toSignal(this.backupService.settings$, {
    initialValue: BACKUP_SETTINGS_DEFAULTS,
  });
  protected readonly state = toSignal(this.backupService.state$, {
    initialValue: BACKUP_STATE_DEFAULTS,
  });
  protected readonly backups = toSignal(this.backupService.backups$, {
    initialValue: [] as readonly BackupFileInfoDto[],
  });
  protected readonly settingsLoading = toSignal(this.backupService.settingsLoading$, {
    initialValue: false,
  });
  protected readonly backupsLoading = toSignal(this.backupService.backupsLoading$, {
    initialValue: false,
  });
  protected readonly runNowLoading = toSignal(this.backupService.runNowLoading$, {
    initialValue: false,
  });
  protected readonly restoreLoading = toSignal(this.backupService.restoreLoading$, {
    initialValue: false,
  });
  protected readonly removeLoading = toSignal(this.backupService.removeLoading$, {
    initialValue: false,
  });
  protected readonly autoBackupIntervalOptions = AUTO_BACKUP_INTERVAL_SELECT_OPTIONS;
  protected readonly retentionCountOptions = RETENTION_COUNT_SELECT_OPTIONS;
  protected readonly backupsTableStructure = createBackupsTableStructure(
    (row) => this.onRestoreBackupRow(row),
    (row) => this.onDeleteBackupRow(row),
    () => this.isBusy(),
  );
  protected readonly backupRows = computed<readonly BackupTableRow[]>(() =>
    this.backups().map((backup) => this.toBackupTableRow(backup)),
  );
  protected readonly autoBackupIntervalValue = computed(() =>
    String(this.normalizeAutoBackupIntervalOption(this.settings().autoBackupIntervalMin)),
  );
  protected readonly retentionCountValue = computed(() =>
    String(this.normalizeRetentionCountOption(this.settings().retentionCount)),
  );
  protected readonly isBusy = computed(
    () =>
      this.state().lastBackupStatus === 'running'
      || this.runNowLoading()
      || this.restoreLoading()
      || this.removeLoading()
      || this.settingsLoading(),
  );
  protected readonly canManageBackups = computed(
    () => this.settings().enabled && Boolean(this.settings().folderPath) && !this.isBusy(),
  );
  protected readonly canRunBackup = computed(() => this.canManageBackups() && !this.runNowLoading());
  protected readonly canChooseFolder = computed(() => this.settings().enabled && !this.isBusy());
  protected readonly showMissingFolderWarning = computed(
    () => this.settings().enabled && !this.settings().folderPath,
  );

  ngOnInit(): void {
    void firstValueFrom(this.backupService.initialize());
  }

  protected onEnabledChange(enabled: boolean): void {
    this.applySettingsPatch({ enabled });
  }

  protected onChooseFolder(): void {
    if (!this.canChooseFolder()) {
      return;
    }

    void firstValueFrom(this.backupService.selectFolder()).then((result) => {
      if (!result?.folderPath) {
        return;
      }

      this.applySettingsPatch({ folderPath: result.folderPath });
    });
  }

  protected onAutoBackupOnQuitChange(autoBackupOnQuit: boolean): void {
    if (!this.settings().enabled) {
      return;
    }

    this.applySettingsPatch({ autoBackupOnQuit });
  }

  protected onAutoBackupIntervalChange(value: string | string[]): void {
    const selectionValue = this.extractSelectionValue(value);
    if (selectionValue === null) {
      return;
    }

    const parsedValue = Number.parseInt(selectionValue, 10);
    if (!Number.isInteger(parsedValue)) {
      return;
    }

    this.applySettingsPatch({
      autoBackupIntervalMin: this.normalizeAutoBackupIntervalOption(parsedValue),
    });
  }

  protected onRetentionCountChange(value: string | string[]): void {
    const selectionValue = this.extractSelectionValue(value);
    if (selectionValue === null) {
      return;
    }

    const parsedValue = Number.parseInt(selectionValue, 10);
    if (!Number.isInteger(parsedValue)) {
      return;
    }

    this.applySettingsPatch({
      retentionCount: this.normalizeRetentionCountOption(parsedValue),
    });
  }

  protected onRunNow(): void {
    if (!this.canRunBackup()) {
      return;
    }

    void firstValueFrom(this.backupService.runNow()).catch(() => undefined);
  }

  protected onRefreshList(): void {
    if (!this.settings().enabled || !this.settings().folderPath || this.backupsLoading()) {
      return;
    }

    void firstValueFrom(this.backupService.listBackups());
  }

  protected onRestoreBackupRow(row: object): void {
    const backup = row as BackupTableRow;
    this.onRestoreBackup(backup.fullPath, backup.fileName);
  }

  protected onDeleteBackupRow(row: object): void {
    const backup = row as BackupTableRow;
    this.onDeleteBackup(backup.fullPath, backup.fileName);
  }

  private onRestoreBackup(backupFilePath: string, backupFileName: string): void {
    if (!backupFilePath || this.isBusy()) {
      return;
    }

    this.alertDialogService.confirm({
      zTitle: this.translateService.instant('dataBackups.backups.restoreAlert.title'),
      zDescription: this.translateService.instant('dataBackups.backups.restoreAlert.description', {
        fileName: backupFileName,
      }),
      zOkText: this.translateService.instant('dataBackups.backups.restoreAlert.actions.restore'),
      zCancelText: this.translateService.instant('dataBackups.backups.restoreAlert.actions.cancel'),
      zOkDestructive: true,
      zMaskClosable: true,
      zClosable: true,
      zOnOk: () => {
        void firstValueFrom(this.backupService.restore(backupFilePath)).catch(() => undefined);
      },
    });
  }

  private onDeleteBackup(backupFilePath: string, backupFileName: string): void {
    if (!backupFilePath || this.isBusy()) {
      return;
    }

    this.alertDialogService.confirm({
      zTitle: this.translateService.instant('dataBackups.backups.deleteAlert.title'),
      zDescription: this.translateService.instant('dataBackups.backups.deleteAlert.description', {
        fileName: backupFileName,
      }),
      zOkText: this.translateService.instant('dataBackups.backups.deleteAlert.actions.delete'),
      zCancelText: this.translateService.instant('dataBackups.backups.deleteAlert.actions.cancel'),
      zOkDestructive: true,
      zMaskClosable: true,
      zClosable: true,
      zOnOk: () => {
        void firstValueFrom(this.backupService.remove(backupFilePath)).catch(() => undefined);
      },
    });
  }

  private toBackupTableRow(backup: BackupFileInfoDto): BackupTableRow {
    return {
      id: backup.fullPath,
      fullPath: backup.fullPath,
      createdAtMs: backup.createdAtMs,
      fileName: backup.fileName,
      sizeLabel: this.formatFileSize(backup.sizeBytes),
    };
  }

  private formatFileSize(sizeBytes: number): string {
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = sizeBytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    const fixedDigits = unitIndex === 0 ? 0 : size >= 100 ? 0 : size >= 10 ? 1 : 2;
    return `${size.toFixed(fixedDigits)} ${units[unitIndex]}`;
  }

  private extractSelectionValue(value: string | string[]): string | null {
    if (Array.isArray(value)) {
      return null;
    }

    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : null;
  }

  private normalizeAutoBackupIntervalOption(value: number): number {
    const normalizedValue = Math.trunc(Number(value));
    return BACKUP_AUTO_INTERVAL_OPTIONS.includes(
      normalizedValue as (typeof BACKUP_AUTO_INTERVAL_OPTIONS)[number],
    )
      ? normalizedValue
      : BACKUP_AUTO_INTERVAL_OPTIONS[0];
  }

  private normalizeRetentionCountOption(value: number): number {
    const normalizedValue = Math.trunc(Number(value));
    return BACKUP_RETENTION_COUNT_OPTIONS.includes(
      normalizedValue as (typeof BACKUP_RETENTION_COUNT_OPTIONS)[number],
    )
      ? normalizedValue
      : BACKUP_RETENTION_COUNT_OPTIONS[0];
  }

  protected statusLabel(status: 'idle' | 'running' | 'ok' | 'error'): string {
    const keyByStatus = {
      idle: 'dataBackups.backups.status.idle',
      running: 'dataBackups.backups.status.running',
      ok: 'dataBackups.backups.status.ok',
      error: 'dataBackups.backups.status.error',
    } as const;

    return this.translateService.instant(keyByStatus[status]);
  }

  private applySettingsPatch(patch: {
    enabled?: boolean;
    folderPath?: string | null;
    autoBackupOnQuit?: boolean;
    autoBackupIntervalMin?: number;
    retentionCount?: number;
  }): void {
    void firstValueFrom(this.backupService.updateSettings(patch));
  }
}
