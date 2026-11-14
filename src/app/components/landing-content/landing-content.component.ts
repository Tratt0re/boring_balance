import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

import { LANDING_AUDIENCES, LANDING_FAQS } from '../../content/landing-content';

@Component({
  selector: 'app-landing-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './landing-content.component.html',
  styleUrl: './landing-content.component.css',
})
export class LandingContentComponent {
  protected readonly audiences = LANDING_AUDIENCES;
  protected readonly faqs = LANDING_FAQS;
}
