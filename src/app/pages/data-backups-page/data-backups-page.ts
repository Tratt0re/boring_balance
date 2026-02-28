import { Component, OnDestroy, OnInit } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ZardAccordionImports } from '@/shared/components/accordion';
import { BackupsAccordionSectionComponent } from './components/backups-accordion-section/backups-accordion-section.component';
import { ExportImportAccordionSectionComponent } from './components/export-import-accordion-section/export-import-accordion-section.component';
import { SyncAccordionSectionComponent } from './components/sync-accordion-section/sync-accordion-section.component';

@Component({
  selector: 'app-data-backups-page',
  imports: [
    TranslatePipe,
    ...ZardAccordionImports,
    BackupsAccordionSectionComponent,
    SyncAccordionSectionComponent,
    ExportImportAccordionSectionComponent,
  ],
  templateUrl: './data-backups-page.html',
})
export class DataBackupsPage implements OnInit, OnDestroy {
  private releaseToolbarActions: (() => void) | null = null;

  constructor(private readonly toolbarContextService: ToolbarContextService) {}

  ngOnInit(): void {
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.dataBackups',
    });
  }

  ngOnDestroy(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
  }
}
