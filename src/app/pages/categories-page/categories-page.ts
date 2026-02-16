import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

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
import type { CategoryCreateDto, CategoryType, CategoryUpdateDto } from '@/dtos';
import type { CategoryModel } from '@/models';
import { CategoriesService } from '@/services/categories.service';
import { ToolbarContextService, type ToolbarAction } from '@/services/toolbar-context.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardDialogService, type ZardDialogRef } from '@/shared/components/dialog';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import { AddCategoryDialogComponent } from './components/add-category-dialog/add-category-dialog.component';

const isCategoryReadonly = (row: object): boolean => {
  const category = row as CategoryModel;
  return category.locked || category.archived;
};

const CATEGORY_TYPE_OPTIONS: readonly EditableOptionItem[] = [
  { label: 'category.type.income', value: 'income' },
  { label: 'category.type.expense', value: 'expense' },
  { label: 'category.type.exclude', value: 'exclude' },
] as const;

const CATEGORY_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'categories.table.columns.name',
    columnKey: 'name',
    type: 'string',
    sortable: true,
    editableType: 'input',
    inputType: 'text',
    placeholder: 'Category name',
    disabled: isCategoryReadonly,
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
    disabled: isCategoryReadonly,
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
    disabled: isCategoryReadonly,
  },
  {
    columnName: 'categories.table.columns.icon',
    columnKey: 'icon',
    type: 'string',
    sortable: true,
    editableType: 'combobox',
    showOptionLabel: true,
    placeholder: 'Select icon',
    options: APP_ICON_OPTIONS,
    disabled: isCategoryReadonly,
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
    disabled: isCategoryReadonly,
    validation: {
      required: true,
    },
  },
] as const;

const createCategoryTableStructure = (
  onArchiveAction: (row: object) => void | Promise<void>,
): readonly TableDataItem[] =>
  [
    ...CATEGORY_TABLE_COLUMNS,
    {
      actionItems: [
        {
          id: 'archive',
          icon: 'archive',
          label: 'categories.table.actions.archive',
          buttonType: 'ghost',
          disabled: (row: object) => {
            const category = row as CategoryModel;
            return category.locked || category.archived;
          },
          action: onArchiveAction,
        },
      ],
    },
  ] as const;

@Component({
  selector: 'app-categories-page',
  imports: [AppDataTableComponent, ZardSkeletonComponent],
  templateUrl: './categories-page.html',
})
export class CategoriesPage implements OnInit, OnDestroy {
  protected readonly categories = signal<readonly CategoryModel[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly categoryTableStructure = createCategoryTableStructure((row) => this.onArchiveCategory(row));
  private readonly toolbarActions: readonly ToolbarAction[] = [
    {
      id: 'add-category',
      label: 'categories.table.actions.add',
      icon: 'plus',
      buttonType: 'default',
      action: () => this.openAddCategoryDialog(),
    },
  ];
  private releaseToolbarActions: (() => void) | null = null;

  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly toolbarContextService: ToolbarContextService,
    private readonly alertDialogService: ZardAlertDialogService,
    private readonly dialogService: ZardDialogService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.categories',
      actions: this.toolbarActions,
    });
    void this.loadCategories();
  }

  ngOnDestroy(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
  }

  protected onEditableValueChange(event: EditableValueChangeEvent): void {
    if (!event.valid) {
      return;
    }

    const category = event.row as CategoryModel;
    if (category.locked || category.archived) {
      return;
    }

    const changes = this.toCategoryChanges(event.columnKey, event.value);
    if (!changes) {
      return;
    }

    void this.updateCategory(category.id, changes);
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

  private onArchiveCategory(row: object): void {
    const category = row as CategoryModel;
    if (category.locked || category.archived) {
      return;
    }

    const translatedCategoryName = this.translateMaybe(category.name);
    this.alertDialogService.confirm({
      zTitle: this.translateService.instant('categories.archiveAlert.title'),
      zDescription: this.translateService.instant('categories.archiveAlert.description', {
        name: translatedCategoryName,
      }),
      zOkText: this.translateService.instant('categories.archiveAlert.actions.archive'),
      zCancelText: this.translateService.instant('categories.archiveAlert.actions.cancel'),
      zOkDestructive: true,
      zMaskClosable: true,
      zClosable: true,
      zOnOk: () => {
        void this.archiveCategory(category.id);
      },
    });
  }

  private translateMaybe(value: string): string {
    const translated = this.translateService.instant(value);
    return translated !== value ? translated : value;
  }

  private openAddCategoryDialog(): void {
    let isCreatingCategory = false;

    const dialogRef = this.dialogService.create({
      zTitle: this.translateService.instant('categories.dialog.add.title'),
      zDescription: this.translateService.instant('categories.dialog.add.description'),
      zContent: AddCategoryDialogComponent,
      zWidth: 'min(96vw, 720px)',
      zMaskClosable: true,
      zOkText: this.translateService.instant('categories.dialog.add.actions.create'),
      zCancelText: this.translateService.instant('categories.dialog.add.actions.cancel'),
      zOkIcon: 'plus',
      zOnOk: (dialogContent) => {
        if (isCreatingCategory) {
          return false;
        }

        const payload = dialogContent.collectCreatePayload();
        if (!payload) {
          return false;
        }

        isCreatingCategory = true;
        void this
          .createCategory(payload, dialogContent, dialogRef)
          .finally(() => {
            isCreatingCategory = false;
          });
        return false;
      },
    });
  }

  private async loadCategories(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const categories = await this.categoriesService.list({
        where: {
          archived: 0,
        },
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

  private async updateCategory(id: number, changes: CategoryUpdateDto['changes']): Promise<void> {
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

  private async archiveCategory(id: number): Promise<void> {
    try {
      const result = await this.categoriesService.update({
        id,
        changes: {
          archived: true,
        },
      });

      if ((result.row && result.row.archived) || result.changed > 0) {
        this.categories.update((rows) => rows.filter((row) => row.id !== id));
        return;
      }

      await this.loadCategories();
    } catch (error) {
      console.error('[categories-page] Failed to archive category:', error);
      await this.loadCategories();
    }
  }

  private async createCategory(
    payload: CategoryCreateDto,
    dialogContent: AddCategoryDialogComponent,
    dialogRef: ZardDialogRef<AddCategoryDialogComponent>,
  ): Promise<void> {
    try {
      const created = await this.categoriesService.create(payload);
      if (!created) {
        dialogContent.setSubmitError('categories.dialog.add.errors.createFailed');
        return;
      }

      this.categories.update((rows) =>
        [...rows, created].sort((left, right) => Number(left.id) - Number(right.id)),
      );
      dialogRef.close(created);
    } catch (error) {
      console.error('[categories-page] Failed to create category:', error);
      dialogContent.setSubmitError('categories.dialog.add.errors.createFailed');
    }
  }
}
