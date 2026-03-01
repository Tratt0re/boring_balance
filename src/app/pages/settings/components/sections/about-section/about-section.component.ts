import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-about-section',
  imports: [TranslatePipe],
  templateUrl: './about-section.component.html',
  styleUrl: './about-section.component.scss',
})
export class AboutSectionComponent {
  private readonly runtimeVersions = typeof window !== 'undefined'
    ? window.electronAPI?.versions ?? null
    : null;

  protected readonly appName = 'Boring Balance';
  protected readonly appVersion: string | null = null;
  protected readonly electronVersion = this.runtimeVersions?.electron ?? null;
  protected readonly nodeVersion = this.runtimeVersions?.node ?? null;
  protected readonly chromeVersion = this.runtimeVersions?.chrome ?? null;
}
