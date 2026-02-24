import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { Z_ALERT_MODAL_DATA } from '@/shared/components/alert-dialog';

export interface RecurringEventRunResultAlertData {
  readonly title: string;
  readonly totalOccurrences: number;
  readonly created: number;
  readonly skippedExisting: number;
}

@Component({
  selector: 'app-recurring-event-run-result-alert-content',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="grid gap-3">
      <div class="rounded-md border bg-muted/20 p-3">
        <p class="text-xs text-muted-foreground">
          {{ 'recurringEvents.runResult.labels.plan' | translate }}
        </p>
        <p class="mt-1 text-sm font-medium break-words">{{ data.title }}</p>
      </div>

      <div class="grid gap-2 sm:grid-cols-3">
        <div class="rounded-md border p-3">
          <p class="text-xs text-muted-foreground">{{ 'recurringEvents.runResult.labels.created' | translate }}</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ data.created }}</p>
        </div>

        <div class="rounded-md border p-3">
          <p class="text-xs text-muted-foreground">{{ 'recurringEvents.runResult.labels.skipped' | translate }}</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ data.skippedExisting }}</p>
        </div>

        <div class="rounded-md border p-3">
          <p class="text-xs text-muted-foreground">{{ 'recurringEvents.runResult.labels.total' | translate }}</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ data.totalOccurrences }}</p>
        </div>
      </div>

      @if (data.created === 0) {
        <p class="text-xs text-muted-foreground">
          {{ 'recurringEvents.runResult.hints.noNewItems' | translate }}
        </p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringEventRunResultAlertContentComponent {
  protected readonly data = inject<RecurringEventRunResultAlertData>(Z_ALERT_MODAL_DATA);
}
