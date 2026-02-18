import { Component, input, output } from '@angular/core';

import { AppDataTableComponent, type EditableValueChangeEvent, type TableDataItem } from '@/components/data-table';

type TableRow = object;

@Component({
  selector: 'app-transactions-table-section',
  imports: [AppDataTableComponent],
  templateUrl: './transactions-table-section.component.html',
})
export class TransactionsTableSectionComponent {
  readonly rows = input<readonly TableRow[]>([]);
  readonly structure = input.required<readonly TableDataItem[]>();
  readonly editableValueChange = output<EditableValueChangeEvent>();

  protected onEditableValueChange(event: EditableValueChangeEvent): void {
    this.editableValueChange.emit(event);
  }
}
