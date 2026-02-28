import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ZardButtonComponent } from '@/shared/components/button';

@Component({
  selector: 'app-export-import-accordion-section',
  imports: [TranslatePipe, ZardButtonComponent],
  templateUrl: './export-import-accordion-section.component.html',
})
export class ExportImportAccordionSectionComponent {}
