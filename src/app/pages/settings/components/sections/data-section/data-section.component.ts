import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardButtonComponent } from '@/shared/components/button';
import { ResetConfirmDialogComponent, type ResetConfirmDialogData } from './reset-confirm-dialog.component';

@Component({
  selector: 'app-data-section',
  imports: [TranslatePipe, ZardButtonComponent],
  templateUrl: './data-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class DataSectionComponent {
  private readonly alertDialogService = inject(ZardAlertDialogService);

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
