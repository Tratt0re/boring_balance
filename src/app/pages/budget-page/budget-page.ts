import { Component, OnDestroy, OnInit } from '@angular/core';

import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';

@Component({
  selector: 'app-budget-page',
  imports: [ZardSkeletonComponent],
  templateUrl: './budget-page.html',
})
export class BudgetPage implements OnInit, OnDestroy {
  private releaseToolbarActions: (() => void) | null = null;

  constructor(
    private readonly toolbarContextService: ToolbarContextService,
  ) {}

  ngOnInit(): void {
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.budget',
      actions: [],
    });
  }

  ngOnDestroy(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
  }
}
