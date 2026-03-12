import { Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { AppMetadataService } from '@/services/app-metadata.service';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardIconComponent } from '@/shared/components/icon';
import { UpdateService } from '@/core/services/update.service';

@Component({
  selector: 'app-about-section',
  imports: [TranslatePipe, ZardButtonComponent, ZardIconComponent],
  templateUrl: './about-section.component.html',
  styleUrl: './about-section.component.scss',
})
export class AboutSectionComponent {
  private readonly appMetadataService = inject(AppMetadataService);
  protected readonly updateService = inject(UpdateService);
  protected readonly checkingUpdates = signal(false);

  protected readonly appName = this.appMetadataService.appInfo.name;
  protected readonly appVersion = this.appMetadataService.appInfo.version;
  protected readonly authorName = this.appMetadataService.appInfo.author;
  protected readonly repositoryUrl = this.appMetadataService.appInfo.repositoryUrl;

  protected async onCheckForUpdates(): Promise<void> {
    this.checkingUpdates.set(true);
    try {
      await this.updateService.forceCheckForUpdates();
      if (!this.updateService.updateAvailable()) {
        toast.success(
          `You're up to date (v${this.updateService.updateResult()?.currentVersion ?? this.appVersion})`,
        );
      }
    } finally {
      this.checkingUpdates.set(false);
    }
  }
}
