import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { SettingsProblem } from '@/config/api';
import { SettingsProblemService } from '@/services/settings-problem.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardButtonComponent } from '@/shared/components/button';
import {
  ResetConfirmDialogComponent,
  type ResetConfirmDialogData,
} from './reset-confirm-dialog.component';

@Component({
  selector: 'app-data-section',
  imports: [TranslatePipe, ZardButtonComponent],
  templateUrl: './data-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class DataSectionComponent implements OnInit {
  private readonly alertDialogService = inject(ZardAlertDialogService);
  private readonly settingsProblemService = inject(SettingsProblemService);

  protected readonly settingsProblem = signal<SettingsProblem | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.settingsProblem.set(await this.settingsProblemService.getProblem());
    } catch {
      // The notice is informational; the section works without it.
      this.settingsProblem.set(null);
    }
  }

  protected async onDismissSettingsProblem(): Promise<void> {
    this.settingsProblem.set(null);
    try {
      await this.settingsProblemService.acknowledgeProblem();
    } catch {
      // Hidden for this visit either way.
    }
  }

  protected onClearFinancialData(): void {
    this.openResetDialog('clear');
  }

  protected onFactoryReset(): void {
    this.openResetDialog('factory');
  }

  private openResetDialog(mode: ResetConfirmDialogData['mode']): void {
    this.alertDialogService.create<ResetConfirmDialogComponent>({
      zContent: ResetConfirmDialogComponent,
      zData: { mode } satisfies ResetConfirmDialogData,
      zOkText: null,
      zCancelText: null,
      zClosable: false,
      zMaskClosable: false,
    });
  }
}
