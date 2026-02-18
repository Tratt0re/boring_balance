import { Component, input, output } from '@angular/core';

import { AppDataTableComponent, type EditableValueChangeEvent, type TableDataItem } from '@/components/data-table';

type TableRow = object;
type RowClassResolver = (row: TableRow) => string | null | undefined;

@Component({
  selector: 'app-transactions-table-section',
  imports: [AppDataTableComponent],
  templateUrl: './transactions-table-section.component.html',
})
export class TransactionsTableSectionComponent {
  readonly rows = input<readonly TableRow[]>([]);
  readonly structure = input.required<readonly TableDataItem[]>();
  readonly rowClass = input<RowClassResolver | null>(null);
  readonly editableValueChange = output<EditableValueChangeEvent>();

  protected onEditableValueChange(event: EditableValueChangeEvent): void {
    this.editableValueChange.emit(event);
  }
}
