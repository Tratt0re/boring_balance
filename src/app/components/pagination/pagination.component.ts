import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardIconComponent } from '@/shared/components/icon';
import { ZardPaginationComponent } from '@/shared/components/pagination';
import { ZardSelectImports } from '@/shared/components/select';

@Component({
  selector: 'app-pagination',
  imports: [TranslatePipe, ZardButtonComponent, ZardIconComponent, ZardPaginationComponent, ...ZardSelectImports],
  templateUrl: './pagination.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppPaginationComponent {
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

  protected readonly normalizedTotalPages = computed(() => Math.max(1, Math.trunc(this.totalPages())));
  protected readonly normalizedCurrentPage = computed(() =>
    Math.min(Math.max(1, Math.trunc(this.currentPage())), this.normalizedTotalPages()),
  );
  protected readonly normalizedMaxVisiblePages = computed(() => Math.max(1, Math.trunc(this.maxVisiblePages())));
  protected readonly normalizedPageSizeOptions = computed(() => {
    const sanitizedOptions = this.pageSizeOptions()
      .map((value) => Math.trunc(value))
      .filter((value) => value > 0);
    const uniqueOptions = Array.from(new Set(sanitizedOptions));
    uniqueOptions.sort((left, right) => left - right);
    return uniqueOptions.length > 0 ? uniqueOptions : [10, 25, 50];
  });
  protected readonly normalizedPageSize = computed(() => {
    const value = Math.trunc(this.pageSize());
    const options = this.normalizedPageSizeOptions();
    if (value > 0) {
      return value;
    }

    return options[0] ?? 10;
  });
  protected readonly pageSizeValue = computed(() => `${this.normalizedPageSize()}`);

  protected onPageChange(page: number): void {
    this.pageChange.emit(page);
  }

  protected goToPreviousPage(): void {
    if (this.normalizedCurrentPage() <= 1) {
      return;
    }

    this.pageChange.emit(this.normalizedCurrentPage() - 1);
  }

  protected goToNextPage(): void {
    if (this.normalizedCurrentPage() >= this.normalizedTotalPages()) {
      return;
    }

    this.pageChange.emit(this.normalizedCurrentPage() + 1);
  }

  protected onPageSizeSelectionChange(value: string | string[]): void {
    if (Array.isArray(value)) {
      return;
    }

    const selectedPageSize = Number(value);
    if (!Number.isInteger(selectedPageSize) || selectedPageSize <= 0) {
      return;
    }

    this.pageSizeChange.emit(selectedPageSize);
  }
}
