import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

import {
  LANDING_AUDIENCES,
  LANDING_BENEFITS,
  LANDING_FAQS,
  LANDING_SUMMARY_FACTS,
} from '../../content/landing-content';
import { APP_CONFIG } from '../../config';

@Component({
  selector: 'app-landing-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './landing-content.component.html',
})
export class LandingContentComponent {
  protected readonly audiences = LANDING_AUDIENCES;
  protected readonly benefits = LANDING_BENEFITS;
  protected readonly faqs = LANDING_FAQS;
  protected readonly summaryFacts = LANDING_SUMMARY_FACTS;

  protected readonly releaseUrl = APP_CONFIG.releaseUrl;
  protected readonly repoUrl = APP_CONFIG.repoUrl;
}
