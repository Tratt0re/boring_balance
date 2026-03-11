import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { ResetService } from '@/services/reset.service';
import { ZardAlertDialogRef } from '@/shared/components/alert-dialog/alert-dialog-ref';
import { Z_ALERT_MODAL_DATA } from '@/shared/components/alert-dialog/alert-dialog.service';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardInputDirective } from '@/shared/components/input';

export interface ResetConfirmDialogData {
  readonly mode: 'clear' | 'factory';
}

@Component({
  selector: 'app-reset-confirm-dialog',
  imports: [TranslatePipe, ZardButtonComponent, ZardInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="flex flex-col gap-4">
      <header>
        <h2 class="text-lg font-semibold">{{ titleKey | translate }}</h2>
        <p class="mt-2 text-sm text-muted-foreground">{{ bodyKey | translate }}</p>
      </header>

      @if (isFactory) {
        <div>
          <input
            z-input
            type="text"
            autocomplete="off"
            spellcheck="false"
            [placeholder]="'settings.data.factory_reset.confirm.input_placeholder' | translate"
            [class]="inputBorderClass()"
            [value]="confirmInput()"
            (input)="onInput($event)"
          />
        </div>
      }

      @if (hasError()) {
        <p class="text-sm text-destructive">{{ 'settings.data.reset_error' | translate }}</p>
      }

      <footer class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          z-button
          zType="ghost"
          [zDisabled]="loading()"
          (click)="onCancel()"
        >
          {{ 'common.cancel' | translate }}
        </button>
        <button
          type="button"
          z-button
          zType="destructive"
          [zDisabled]="!canConfirm()"
          [zLoading]="loading()"
          [attr.aria-disabled]="!canConfirm()"
          (click)="onConfirm()"
        >
          {{ ctaKey | translate }}
        </button>
      </footer>
    </div>
  `,
})
export class ResetConfirmDialogComponent {
  private readonly data = inject<ResetConfirmDialogData>(Z_ALERT_MODAL_DATA as never);
  private readonly dialogRef = inject(ZardAlertDialogRef);
  private readonly resetService = inject(ResetService);
  private readonly translateService = inject(TranslateService);

  readonly isFactory = this.data.mode === 'factory';

  readonly titleKey = this.isFactory
    ? 'settings.data.factory_reset.confirm.title'
    : 'settings.data.clear_financial.confirm.title';
  readonly bodyKey = this.isFactory
    ? 'settings.data.factory_reset.confirm.body'
    : 'settings.data.clear_financial.confirm.body';
  readonly ctaKey = this.isFactory
    ? 'settings.data.factory_reset.confirm.cta'
    : 'settings.data.clear_financial.confirm.cta';

  readonly confirmInput = signal('');
  readonly loading = signal(false);
  readonly hasError = signal(false);

  readonly inputMatchesReset = computed(() => this.confirmInput() === 'RESET');

  readonly canConfirm = computed(() => {
    if (this.loading()) return false;
    return this.isFactory ? this.inputMatchesReset() : true;
  });

  readonly inputBorderClass = computed(() => {
    const val = this.confirmInput();
    if (val.length === 0) return '';
    return this.inputMatchesReset() ? '' : '[&]:border-destructive focus-visible:[&]:border-destructive';
  });

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.confirmInput.set(target.value);
    this.hasError.set(false);
  }

  onCancel(): void {
    if (this.loading()) return;
    this.dialogRef.close();
  }

  onConfirm(): void {
    if (!this.canConfirm()) return;
    void this.runReset();
  }

  private async runReset(): Promise<void> {
    this.loading.set(true);
    this.hasError.set(false);

    try {
      const result = this.isFactory
        ? await this.resetService.factoryReset()
        : await this.resetService.clearFinancialData();

      if (!result.ok) {
        this.loading.set(false);
        this.hasError.set(true);
        return;
      }

      this.dialogRef.close();

      if (this.isFactory) {
        try {
          globalThis.localStorage?.clear();
        } catch {
          // Ignore storage clear errors (private mode, restricted contexts, etc.).
        }
        try {
          globalThis.sessionStorage?.clear();
        } catch {
          // Ignore storage clear errors (private mode, restricted contexts, etc.).
        }
        globalThis.location.reload();
      } else {
        toast.success(this.translateService.instant('settings.data.clear_financial.success'));
        globalThis.setTimeout(() => globalThis.location.reload(), 800);
      }
    } catch {
      this.loading.set(false);
      this.hasError.set(true);
    }
  }
}
