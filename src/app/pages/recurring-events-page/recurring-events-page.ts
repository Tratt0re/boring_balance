import { Component, OnDestroy, OnInit } from '@angular/core';

import { ToolbarContextService } from '@/services/toolbar-context.service';

@Component({
  selector: 'app-recurring-events-page',
  templateUrl: './recurring-events-page.html',
})
export class RecurringEventsPage implements OnInit, OnDestroy {
  private releaseToolbarActions: (() => void) | null = null;

  constructor(
    private readonly toolbarContextService: ToolbarContextService,
  ) {}

  ngOnInit(): void {
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.recurringEvents',
      actions: [],
    });
  }

  ngOnDestroy(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
  }
}
