import { Component, OnInit, signal } from '@angular/core';

import {
  APP_COLOR_KEY_SET,
  APP_COLOR_OPTIONS,
  APP_ICON_KEY_SET,
  APP_ICON_OPTIONS,
} from '@/config/visual-options.config';
import {
  AppDataTableComponent,
  type EditableOptionItem,
  type EditableValueChangeEvent,
  type TableDataItem,
} from '@/components/data-table';
import type { CategoryType, CategoryUpdateDto } from '@/dtos';
import type { CategoryModel } from '@/models';
import { CategoriesService } from '@/services/categories.service';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';

const isCategoryLocked = (row: object): boolean => (row as CategoryModel).locked;

const CATEGORY_TYPE_OPTIONS: readonly EditableOptionItem[] = [
  { label: 'category.type.income', value: 'income' },
  { label: 'category.type.expense', value: 'expense' },
  { label: 'category.type.exclude', value: 'exclude' },
] as const;

const CATEGORY_TABLE_STRUCTURE: readonly TableDataItem[] = [
  {
    columnName: 'categories.table.columns.name',
    columnKey: 'name',
    type: 'string',
    sortable: true,
    editableType: 'input',
    inputType: 'text',
    placeholder: 'Category name',
    disabled: isCategoryLocked,
    validation: {
      required: true,
      minLength: 2,
      maxLength: 64,
    },
  },
  {
    columnName: 'categories.table.columns.description',
    columnKey: 'description',
    type: 'string',
    sortable: true,
    editableType: 'input',
    inputType: 'text',
    placeholder: 'Category description',
    disabled: isCategoryLocked,
    validation: {
      maxLength: 160,
    },
  },
  {
    columnName: 'categories.table.columns.color',
    columnKey: 'colorKey',
    type: 'string',
    sortable: true,
    editableType: 'select',
    showOptionLabel: true,
    placeholder: 'Select color',
    options: APP_COLOR_OPTIONS,
    disabled: isCategoryLocked,
  },
  {
    columnName: 'categories.table.columns.icon',
    columnKey: 'icon',
    type: 'string',
    sortable: true,
    editableType: 'select',
    showOptionLabel: true,
    placeholder: 'Select icon',
    options: APP_ICON_OPTIONS,
    disabled: isCategoryLocked,
  },
  {
    columnName: 'categories.table.columns.type',
    columnKey: 'type',
    type: 'badge',
    sortable: true,
    badge: {
      shape: 'pill',
      type: 'secondary',
    },
    editableType: 'select',
    placeholder: 'Select type',
    options: CATEGORY_TYPE_OPTIONS,
    disabled: isCategoryLocked,
    validation: {
      required: true,
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

  constructor(private readonly categoriesService: CategoriesService) {}

  ngOnInit(): void {
    void this.loadCategories();
  }

  protected onEditableValueChange(event: EditableValueChangeEvent): void {
    if (!event.valid) {
      return;
    }

    const category = event.row as CategoryModel;
    if (category.locked) {
      return;
    }

    const changes = this.toCategoryChanges(event.columnKey, event.value);
    if (!changes) {
      return;
    }

    void this.persistCategoryUpdate(category.id, changes);
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

  private async persistCategoryUpdate(id: number, changes: CategoryUpdateDto['changes']): Promise<void> {
    try {
      const result = await this.categoriesService.update({ id, changes });

      if (result.row) {
        this.categories.update((rows) => rows.map((row) => (row.id === id ? result.row! : row)));
        return;
      }

      if (result.changed > 0) {
        await this.loadCategories();
      }
    } catch (error) {
      console.error('[categories-page] Failed to update category:', error);
      await this.loadCategories();
    }
  }

  private toCategoryChanges(columnKey: string, value: unknown): CategoryUpdateDto['changes'] | null {
    switch (columnKey) {
      case 'name': {
        const name = this.toRequiredString(value);
        return name ? { name } : null;
      }
      case 'description':
        return { description: this.toNullableString(value) };
      case 'colorKey':
        return { color_key: this.toNullableColor(value) };
      case 'icon':
        return { icon: this.toNullableIcon(value) };
      case 'type':
        return this.isCategoryType(value) ? { type: value } : null;
      default:
        return null;
    }
  }

  private toNullableString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const text = `${value}`.trim();
    return text.length > 0 ? text : null;
  }

  private toRequiredString(value: unknown): string | null {
    const text = this.toNullableString(value);
    return text && text.length > 0 ? text : null;
  }

  private toNullableIcon(value: unknown): string | null {
    const icon = this.toNullableString(value);
    if (!icon) {
      return null;
    }

    return APP_ICON_KEY_SET.has(icon) ? icon : null;
  }

  private toNullableColor(value: unknown): string | null {
    const color = this.toNullableString(value);
    if (!color) {
      return null;
    }

    return APP_COLOR_KEY_SET.has(color) ? color : null;
  }

  private isCategoryType(value: unknown): value is CategoryType {
    return value === 'income' || value === 'expense' || value === 'exclude';
  }
}
