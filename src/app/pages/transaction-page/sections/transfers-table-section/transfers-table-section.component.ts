import { booleanAttribute, Component, input, output } from '@angular/core';

import { AppDataTableComponent, type TableDataItem } from '@/components/data-table';

type TableRow = object;

@Component({
  selector: 'app-transfers-table-section',
  imports: [AppDataTableComponent],
  templateUrl: './transfers-table-section.component.html',
})
export class TransfersTableSectionComponent {
  readonly rows = input<readonly TableRow[]>([]);
  readonly structure = input.required<readonly TableDataItem[]>();
  readonly showPagination = input(false, { transform: booleanAttribute });
  readonly currentPage = input(1);
  readonly totalPages = input(1);
  readonly pageSize = input(10);
  readonly pageSizeOptions = input<readonly number[]>([10, 25, 50]);
  readonly maxVisiblePages = input(5);
  readonly pageSizeLabel = input('Rows per page');
  readonly showPageSizeSelector = input(false, { transform: booleanAttribute });
  readonly showTopPagination = input(false, { transform: booleanAttribute });
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  protected onPageChange(page: number): void {
    this.pageChange.emit(page);
  }

  protected onPageSizeChange(pageSize: number): void {
    this.pageSizeChange.emit(pageSize);
  }
}
