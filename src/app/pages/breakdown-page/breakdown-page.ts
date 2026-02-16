import { Component, OnDestroy, OnInit } from '@angular/core';

import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';

@Component({
  selector: 'app-breakdown-page',
  imports: [ZardSkeletonComponent],
  templateUrl: './breakdown-page.html',
})
export class BreakdownPage implements OnInit, OnDestroy {
  private releaseToolbarActions: (() => void) | null = null;

  constructor(
    private readonly toolbarContextService: ToolbarContextService,
  ) {}

  ngOnInit(): void {
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.breakdown',
      actions: [],
    });
  }

  ngOnDestroy(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
  }
}
