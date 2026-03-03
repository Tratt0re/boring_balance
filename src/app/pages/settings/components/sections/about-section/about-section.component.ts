import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AppMetadataService } from '@/services/app-metadata.service';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardIconComponent } from '@/shared/components/icon';

@Component({
  selector: 'app-about-section',
  imports: [TranslatePipe, ZardButtonComponent, ZardIconComponent],
  templateUrl: './about-section.component.html',
  styleUrl: './about-section.component.scss',
})
export class AboutSectionComponent {
  private readonly appMetadataService = inject(AppMetadataService);

  protected readonly appName = this.appMetadataService.appInfo.name;
  protected readonly appVersion = this.appMetadataService.appInfo.version;
  protected readonly authorName = this.appMetadataService.appInfo.author;
  protected readonly repositoryUrl = this.appMetadataService.appInfo.repositoryUrl;
}
