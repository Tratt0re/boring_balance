import { Component, OnInit, signal } from '@angular/core';

import { AppDataTableComponent, type TableDataStructure } from '@/components/data-table';
import type { CategoryModel } from '@/models';
import { CategoriesService } from '@/services/categories.service';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';

const CATEGORY_TABLE_STRUCTURE: readonly TableDataStructure[] = [
  {
    rowDataItem: {
      columnName: 'ID',
      columnKey: 'id',
      type: 'number',
      sortable: true,
    },
  },
  {
    rowDataItem: {
      columnName: 'Name',
      columnKey: 'name',
      type: 'string',
      sortable: true,
      translate: true,
    },
  },
  {
    rowDataItem: {
      columnName: 'Type',
      columnKey: 'type',
      type: 'string',
      sortable: true,
    },
  },
  {
    rowDataItem: {
      columnName: 'Parent',
      columnKey: 'parentId',
      type: 'number',
      sortable: true,
    },
  },
  {
    rowDataItem: {
      columnName: 'Locked',
      columnKey: 'locked',
      type: 'boolean',
      sortable: true,
    },
  },
  {
    rowDataItem: {
      columnName: 'Archived',
      columnKey: 'archived',
      type: 'boolean',
      sortable: true,
    },
  },
] as const;

@Component({
  selector: 'app-categories-page',
  imports: [AppDataTableComponent, ZardSkeletonComponent],
  templateUrl: './categories-page.html',
})
export class CategoriesPage implements OnInit {
  protected readonly categories = signal<readonly CategoryModel[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly categoryTableStructure = CATEGORY_TABLE_STRUCTURE;

  constructor(private readonly categoriesService: CategoriesService) { }

  ngOnInit(): void {
    void this.loadCategories();
  }

  private async loadCategories(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const categories = await this.categoriesService.list({
        options: {
          orderBy: 'id',
          orderDirection: 'ASC',
        },
      });
      this.categories.set(categories);
    } catch (error) {
      this.categories.set([]);
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading categories.');
      console.error('[categories-page] Failed to list categories:', error);
    } finally {
      this.isLoading.set(false);
    }
  }
}
