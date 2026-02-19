import { booleanAttribute, Component, input, output } from '@angular/core';

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
  readonly showPagination = input(false, { transform: booleanAttribute });
  readonly currentPage = input(1);
  readonly totalPages = input(1);
  readonly pageSize = input(10);
  readonly pageSizeOptions = input<readonly number[]>([10, 25, 50]);
  readonly maxVisiblePages = input(5);
  readonly pageSizeLabel = input('Rows per page');
  readonly showPageSizeSelector = input(false, { transform: booleanAttribute });
  readonly showTopPagination = input(false, { transform: booleanAttribute });
  readonly editableValueChange = output<EditableValueChangeEvent>();
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  protected onEditableValueChange(event: EditableValueChangeEvent): void {
    this.editableValueChange.emit(event);
  }

  protected onPageChange(page: number): void {
    this.pageChange.emit(page);
  }

  protected onPageSizeChange(pageSize: number): void {
    this.pageSizeChange.emit(pageSize);
  }
}
