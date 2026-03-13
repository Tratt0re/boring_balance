import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';
import { LucideAngularModule, Download, Github, Loader } from 'lucide-angular';

import { BrandIconComponent } from '../brand-icon/brand-icon.component';
import { Platform, ReleaseService } from '../../services/release.service';
import { APP_CONFIG } from '../../config';

@Component({
  selector: 'app-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [BrandIconComponent, LucideAngularModule],
  templateUrl: './hero.component.html',
})
export class HeroComponent {
  protected readonly release = inject(ReleaseService);
  protected readonly repoUrl = APP_CONFIG.repoUrl;

  protected readonly downloadIcon = Download;
  protected readonly githubIcon = Github;
  protected readonly loaderIcon = Loader;

  protected getPlatformLabel(platform: Platform): string {
    return this.release.getPlatformLabel(platform);
  }

  protected getPlatformUrl(platform: Platform): string {
    const state = this.release.releaseState();
    if (state.status === 'ready') return state.urls[platform];
    return APP_CONFIG.fallback[platform];
  }
}
