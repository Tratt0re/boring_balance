import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AppDataTableComponent, type TableDataItem } from '@/components/data-table';
import type { CategoryCreateDto } from '@/dtos';
import type { CategoryModel } from '@/models';
import { CategoriesService } from '@/services/categories.service';
import { ToolbarContextService, type ToolbarAction } from '@/services/toolbar-context.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardDialogService, type ZardDialogRef } from '@/shared/components/dialog';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import {
  UpsertCategoryDialogComponent,
  type UpsertCategoryDialogData,
} from './components/upsert-category-dialog/upsert-category-dialog.component';

const isCategoryReadonly = (row: object): boolean => {
  const category = row as CategoryModel;
  return category.locked || category.archived;
};

const CATEGORY_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'categories.table.columns.name',
    columnKey: 'name',
    type: 'string',
    sortable: true,
  },
  {
    columnName: 'categories.table.columns.description',
    columnKey: 'description',
    type: 'string',
    sortable: true,
  },
  {
    columnName: 'categories.table.columns.color',
    columnKey: 'colorKey',
    type: 'string',
    sortable: true,
  },
  {
    columnName: 'categories.table.columns.icon',
    columnKey: 'icon',
    type: 'string',
    sortable: true,
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
  },
] as const;

const createCategoryTableStructure = (
  onEditAction: (row: object) => void | Promise<void>,
  onArchiveAction: (row: object) => void | Promise<void>,
): readonly TableDataItem[] =>
  [
    ...CATEGORY_TABLE_COLUMNS,
    {
      actionItems: [
        {
          id: 'edit',
          icon: 'pencil',
          label: 'categories.table.actions.edit',
          buttonType: 'ghost',
          disabled: isCategoryReadonly,
          action: onEditAction,
        },
        {
          id: 'archive',
          icon: 'archive',
          label: 'categories.table.actions.archive',
          buttonType: 'ghost',
          disabled: isCategoryReadonly,
          action: onArchiveAction,
        },
      ],
    },
  ] as const;

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

@Component({
  selector: 'app-categories-page',
  imports: [AppDataTableComponent, TranslatePipe, ZardSkeletonComponent],
  templateUrl: './categories-page.html',
})
export class CategoriesPage implements OnInit, OnDestroy {
  protected readonly categories = signal<readonly CategoryModel[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly categoryTableStructure = createCategoryTableStructure(
    (row) => this.onEditCategory(row),
    (row) => this.onArchiveCategory(row),
  );
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

  protected onPageChange(nextPage: number): void {
    if (nextPage === this.page()) {
      return;
    }

    this.page.set(nextPage);
    void this.loadCategories(nextPage);
  }

  protected onPageSizeChange(nextPageSize: number): void {
    if (
      !PAGE_SIZE_OPTIONS.includes(nextPageSize as (typeof PAGE_SIZE_OPTIONS)[number]) ||
      nextPageSize === this.pageSize()
    ) {
      return;
    }

    this.pageSize.set(nextPageSize);
    this.page.set(1);
    void this.loadCategories(1);
  }

  private onEditCategory(row: object): void {
    const category = row as CategoryModel;
    if (isCategoryReadonly(category)) {
      return;
    }

    let isUpdatingCategory = false;

    const dialogRef = this.dialogService.create<UpsertCategoryDialogComponent, UpsertCategoryDialogData>({
      zTitle: this.translateService.instant('categories.dialog.edit.title'),
      zDescription: this.translateService.instant('categories.dialog.edit.description'),
      zContent: UpsertCategoryDialogComponent,
      zData: {
        category: {
          name: category.name,
          description: category.description,
          colorKey: category.colorKey,
          icon: category.icon,
          type: category.type,
        },
      },
      zWidth: 'min(96vw, 720px)',
      zMaskClosable: true,
      zOkText: this.translateService.instant('categories.dialog.edit.actions.save'),
      zCancelText: this.translateService.instant('categories.dialog.edit.actions.cancel'),
      zOkIcon: 'pencil',
      zOnOk: (dialogContent) => {
        if (isUpdatingCategory) {
          return false;
        }

        const changes = dialogContent.collectUpdateChanges();
        if (!changes) {
          return false;
        }

        isUpdatingCategory = true;
        void this
          .updateCategoryFromDialog(category.id, changes, dialogContent, dialogRef)
          .finally(() => {
            isUpdatingCategory = false;
          });
        return false;
      },
    });
  }

  private onArchiveCategory(row: object): void {
    const category = row as CategoryModel;
    if (isCategoryReadonly(category)) {
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
      zContent: UpsertCategoryDialogComponent,
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

  private async loadCategories(page = this.page()): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const response = await this.categoriesService.list({
        where: {
          archived: 0,
        },
        page,
        page_size: this.pageSize(),
        options: {
          orderBy: 'id',
          orderDirection: 'ASC',
        },
      });
      this.categories.set(response.rows);
      this.total.set(response.total);
      this.page.set(response.page);
    } catch (error) {
      this.categories.set([]);
      this.total.set(0);
      this.page.set(1);
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading categories.');
      console.error('[categories-page] Failed to list categories:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async updateCategoryFromDialog(
    id: number,
    changes: NonNullable<ReturnType<UpsertCategoryDialogComponent['collectUpdateChanges']>>,
    dialogContent: UpsertCategoryDialogComponent,
    dialogRef: ZardDialogRef<UpsertCategoryDialogComponent>,
  ): Promise<void> {
    try {
      const result = await this.categoriesService.update({ id, changes });

      if (result.row) {
        this.categories.update((rows) => rows.map((row) => (row.id === id ? result.row! : row)));
        dialogRef.close(result.row);
        return;
      }

      if (result.changed > 0) {
        await this.loadCategories();
        dialogRef.close(null);
        return;
      }

      dialogContent.setSubmitError('categories.dialog.edit.errors.updateFailed');
    } catch (error) {
      console.error('[categories-page] Failed to update category:', error);
      dialogContent.setSubmitError('categories.dialog.edit.errors.updateFailed');
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
        await this.loadCategories();
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
    dialogContent: UpsertCategoryDialogComponent,
    dialogRef: ZardDialogRef<UpsertCategoryDialogComponent>,
  ): Promise<void> {
    try {
      const created = await this.categoriesService.create(payload);
      if (!created) {
        dialogContent.setSubmitError('categories.dialog.add.errors.createFailed');
        return;
      }

      const nextTotal = this.total() + 1;
      const targetPage = Math.max(1, Math.ceil(nextTotal / this.pageSize()));
      this.page.set(targetPage);
      await this.loadCategories(targetPage);
      dialogRef.close(created);
    } catch (error) {
      console.error('[categories-page] Failed to create category:', error);
      dialogContent.setSubmitError('categories.dialog.add.errors.createFailed');
    }
  }
}
