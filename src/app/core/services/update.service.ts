import { computed, Injectable, signal } from '@angular/core';

import { APIChannel } from '@/config/api';
import type { UpdateCheckResult } from '@/config/api';
import { BaseIpcService } from '@/services/base-ipc.service';

@Injectable({ providedIn: 'root' })
export class UpdateService extends BaseIpcService<APIChannel.UPDATE> {
  constructor() {
    super(APIChannel.UPDATE);
  }

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

  /**
   * The check made when the app starts. A failure (no network, GitHub unreachable) must not disturb the
   * user or leave an unhandled error, so it is logged and the state is left as it was.
   */
  async checkForUpdates(): Promise<void> {
    try {
      this.result.set(await this.ipcClient.check());
    } catch (error) {
      console.error('[update] Could not check for updates:', error);
    }
  }

  /**
   * The check the user asked for. A failure is passed on to the caller, which tells the user, because
   * they are waiting for the answer.
   */
  async forceCheckForUpdates(): Promise<void> {
    this.result.set(await this.ipcClient.forceCheck());
  }

  openReleasePage(): void {
    const url = this.result()?.releaseUrl;
    if (url) void this.ipcClient.openRelease({ url });
  }

  ignoreVersion(version: string): void {
    void this.ipcClient.ignoreVersion({ version });
  }

  dismissModal(): void {
    this.modalDismissed.set(true);
  }
}
