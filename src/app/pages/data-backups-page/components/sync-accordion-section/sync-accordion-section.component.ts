import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardSwitchComponent } from '@/shared/components/switch';

@Component({
  selector: 'app-sync-accordion-section',
  imports: [TranslatePipe, ZardButtonComponent, ZardSwitchComponent],
  templateUrl: './sync-accordion-section.component.html',
})
export class SyncAccordionSectionComponent {}
