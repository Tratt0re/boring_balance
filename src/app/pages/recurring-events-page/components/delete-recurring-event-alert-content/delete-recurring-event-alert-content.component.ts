import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ZardSwitchComponent } from '@/shared/components/switch';

@Component({
  selector: 'app-delete-recurring-event-alert-content',
  standalone: true,
  imports: [TranslatePipe, ZardSwitchComponent],
  template: `
    <div class="rounded-md border p-3">
      <z-switch [zChecked]="deleteLinkedItems()" (zCheckedChange)="deleteLinkedItems.set($event)">
        {{ 'recurringEvents.deleteAlert.options.deleteLinkedItems' | translate }}
      </z-switch>
      <p class="mt-2 text-xs text-muted-foreground">
        {{ 'recurringEvents.deleteAlert.options.deleteLinkedItemsHint' | translate }}
      </p>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteRecurringEventAlertContentComponent {
  protected readonly deleteLinkedItems = signal(false);

  public shouldDeleteLinkedItems(): boolean {
    return this.deleteLinkedItems();
  }
}
