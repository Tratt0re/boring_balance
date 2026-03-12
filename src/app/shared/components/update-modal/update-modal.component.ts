import { ChangeDetectionStrategy, Component, inject, signal, ViewEncapsulation } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { UpdateService } from '@/core/services/update.service';
import { ZardButtonComponent } from '@/shared/components/button/button.component';
import { ZardCheckboxComponent } from '@/shared/components/checkbox/checkbox.component';
import { ZardIconComponent } from '@/shared/components/icon/icon.component';

@Component({
  selector: 'app-update-modal',
  imports: [TranslatePipe, ZardButtonComponent, ZardCheckboxComponent, ZardIconComponent],
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-modal-title"
      (keydown.escape)="onDismiss()"
    >
      <div
        class="relative flex w-full max-w-md flex-col gap-5 rounded-lg border border-border bg-card p-6 shadow-lg"
      >
        <header class="flex flex-col gap-1.5">
          <div class="flex items-center gap-2">
            <z-icon zType="arrow-up" class="size-5 shrink-0 text-foreground" />
            <h2 id="update-modal-title" class="text-base font-semibold">
              {{ 'update.modal.title' | translate }}
            </h2>
          </div>
          <p class="text-sm text-muted-foreground">
            {{
              'update.modal.body'
                | translate
                  : {
                      current: updateService.updateResult()?.currentVersion,
                      latest: updateService.updateResult()?.latestVersion
                    }
            }}
          </p>
        </header>

        <z-checkbox [(zChecked)]="ignoreChecked">
          {{
            'update.modal.ignore'
              | translate: { latest: updateService.updateResult()?.latestVersion }
          }}
        </z-checkbox>

        <footer class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" z-button zType="outline" (click)="onDismiss()">
            {{
              'update.modal.cta.dismiss'
                | translate: { current: updateService.updateResult()?.currentVersion }
            }}
          </button>
          <button type="button" z-button zType="default" (click)="onUpdate()">
            {{ 'update.modal.cta.update' | translate }}
          </button>
        </footer>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class UpdateModalComponent {
  protected readonly updateService = inject(UpdateService);
  protected readonly ignoreChecked = signal(false);

  protected onUpdate(): void {
    this.persistIgnoreIfChecked();
    this.updateService.openReleasePage();
    this.updateService.dismissModal();
  }

  protected onDismiss(): void {
    this.persistIgnoreIfChecked();
    this.updateService.dismissModal();
  }

  private persistIgnoreIfChecked(): void {
    if (this.ignoreChecked()) {
      const version = this.updateService.updateResult()?.latestVersion;
      if (version) this.updateService.ignoreVersion(version);
    }
  }
}
