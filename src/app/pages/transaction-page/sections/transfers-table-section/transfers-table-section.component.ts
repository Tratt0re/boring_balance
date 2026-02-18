import { Component, input } from '@angular/core';

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
}
