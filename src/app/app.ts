import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';

import { FeatureStripComponent } from './components/feature-strip/feature-strip.component';
import { HeroComponent } from './components/hero/hero.component';
import { LandingContentComponent } from './components/landing-content/landing-content.component';
import { PageFooterComponent } from './components/page-footer/page-footer.component';
import { PageHeaderComponent } from './components/page-header/page-header.component';
import { SeoService } from './services/seo.service';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [
    PageHeaderComponent,
    HeroComponent,
    FeatureStripComponent,
    LandingContentComponent,
    PageFooterComponent,
  ],
  templateUrl: './app.html',
})
export class App {
  // Injecting ThemeService here ensures it is instantiated at bootstrap
  // and its constructor effect applies the stored/system theme immediately.
  readonly theme = inject(ThemeService);
  private readonly seo = inject(SeoService);

  constructor() {
    this.seo.applyLandingPageMetadata();
  }
}
