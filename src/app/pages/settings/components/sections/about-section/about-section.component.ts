import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { AppMetadataService } from '@/services/app-metadata.service';
import { AppBrandIconComponent } from '@/components/brand-icon/brand-icon.component';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardIconComponent } from '@/shared/components/icon';
import { UpdateService } from '@/core/services/update.service';

@Component({
  selector: 'app-about-section',
  imports: [TranslatePipe, AppBrandIconComponent, ZardButtonComponent, ZardIconComponent],
  templateUrl: './about-section.component.html',
  styleUrl: './about-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutSectionComponent {
  private readonly appMetadataService = inject(AppMetadataService);
  private readonly translateService = inject(TranslateService);
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
          this.translateService.instant('settings.about.upToDate', {
            version: this.updateService.updateResult()?.currentVersion ?? this.appVersion,
          }),
        );
      }
    } catch (error) {
      console.error('[about-section] Could not check for updates:', error);
      toast.error(this.translateService.instant('settings.about.updateCheckFailed'));
    } finally {
      this.checkingUpdates.set(false);
    }
  }
}
