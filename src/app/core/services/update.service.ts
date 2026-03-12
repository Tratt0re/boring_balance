import { computed, Injectable, signal } from '@angular/core';

import type { UpdateCheckResult } from '@/config/api';

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly result = signal<UpdateCheckResult | null>(null);
  private readonly modalDismissed = signal(false);

  readonly updateResult = this.result.asReadonly();
  readonly updateAvailable = computed(() => this.result()?.updateAvailable ?? false);
  readonly showModal = computed(
    () =>
      this.updateAvailable() &&
      !this.result()?.popupDismissedForThisVersion &&
      !this.modalDismissed(),
  );

  async checkForUpdates(): Promise<void> {
    const result = await window.electronAPI!.ipcClient.update.check();
    this.result.set(result);
  }

  async forceCheckForUpdates(): Promise<void> {
    const result = await window.electronAPI!.ipcClient.update.forceCheck();
    this.result.set(result);
  }

  openReleasePage(): void {
    const url = this.result()?.releaseUrl;
    if (url) window.electronAPI!.ipcClient.update.openRelease({ url });
  }

  ignoreVersion(version: string): void {
    window.electronAPI!.ipcClient.update.ignoreVersion({ version });
  }

  dismissModal(): void {
    this.modalDismissed.set(true);
  }

}
