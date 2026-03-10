import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { AppDataTableComponent, type TableDataItem } from '@/components/data-table';
import {
  DEFAULT_VISUAL_COLOR_KEY,
  DEFAULT_VISUAL_ICON_KEY,
} from '@/config/visual-options.config';
import type { CategoryCreateDto } from '@/dtos';
import type { CategoryModel } from '@/models';
import { CategoriesService } from '@/services/categories.service';
import { ToolbarContextService, type ToolbarAction } from '@/services/toolbar-context.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardDialogService, type ZardDialogRef } from '@/shared/components/dialog';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  computePageCount,
  createActionColumn,
  getTargetPageAfterCreate,
  translateMaybe,
} from '@/shared/utils';
import {
  UpsertCategoryDialogComponent,
  type UpsertCategoryDialogData,
} from './components/upsert-category-dialog/upsert-category-dialog.component';

const isCategoryReadonly = (row: object): boolean => {
  const category = row as CategoryTableRow;
  return category.locked || category.archived;
};

interface CategoryTableRow {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly colorKey: string | null;
  readonly colorHex: string;
  readonly icon: string | null;
  readonly type: CategoryModel['type'];
  readonly typeLabel: string;
  readonly typeColorHex: string | null;
  readonly locked: boolean;
  readonly archived: boolean;
}

const CATEGORY_TYPE_COLOR_HEX_BY_TYPE: Record<CategoryModel['type'], string | null> = {
  income: 'var(--chart-income)',
  expense: 'var(--chart-expense)',
  exclude: null,
};

const CATEGORY_COLUMN_WIDTH = {
  name: '1/5',
  description: '2/5',
  type: '1/10',
  action: '1/10',
} as const;

const CATEGORY_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'common.labels.name',
    columnKey: 'name',
    type: 'badge',
    sortable: true,
    minWidth: CATEGORY_COLUMN_WIDTH.name,
    maxWidth: CATEGORY_COLUMN_WIDTH.name,
    badge: {
      type: 'secondary',
      shape: 'pill',
      icon: DEFAULT_VISUAL_ICON_KEY,
      iconColumnKey: 'icon',
      colorHexColumnKey: 'colorHex',
      colorMode: 'icon',
    },
  },
  {
    columnName: 'common.labels.type',
    columnKey: 'typeLabel',
    type: 'badge',
    sortable: true,
    minWidth: CATEGORY_COLUMN_WIDTH.type,
    maxWidth: CATEGORY_COLUMN_WIDTH.type,
    badge: {
      shape: 'pill',
      type: 'secondary',
      colorHexColumnKey: 'typeColorHex',
    },
  },
  {
    columnName: 'common.labels.description',
    columnKey: 'description',
    type: 'string',
    sortable: true,
    minWidth: CATEGORY_COLUMN_WIDTH.description,
    maxWidth: CATEGORY_COLUMN_WIDTH.description,
  },
] as const;

const createCategoryTableStructure = (
  onEditAction: (row: object) => void | Promise<void>,
  onArchiveAction: (row: object) => void | Promise<void>,
): readonly TableDataItem[] =>
  [
    ...CATEGORY_TABLE_COLUMNS,
    createActionColumn(CATEGORY_COLUMN_WIDTH.action, [
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
      {
        id: 'readonly-lock',
        icon: 'lock',
        label: 'categories.table.actions.locked',
        buttonType: 'ghost',
        visible: isCategoryReadonly,
        disabled: () => true,
        showWhenDisabled: true,
        action: () => undefined,
      },
    ]),
  ] as const;

@Component({
  selector: 'app-categories-page',
  imports: [AppDataTableComponent, TranslatePipe, ZardSkeletonComponent],
  templateUrl: './categories-page.html',
})
export class CategoriesPage implements OnInit, OnDestroy {
  protected readonly categories = signal<readonly CategoryTableRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly pageCount = computed(() => computePageCount(this.total(), this.pageSize()));
  protected readonly categoryRowClass = (row: object): string =>
    isCategoryReadonly(row) ? 'bg-primary-foreground' : '';
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
      itemActions: this.toolbarActions,
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

  private toCategoryTableRow(category: CategoryModel): CategoryTableRow {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      colorKey: category.colorKey,
      colorHex: `var(--${category.colorKey ?? DEFAULT_VISUAL_COLOR_KEY})`,
      icon: category.icon,
      type: category.type,
      typeLabel: `category.type.${category.type}`,
      typeColorHex: CATEGORY_TYPE_COLOR_HEX_BY_TYPE[category.type],
      locked: category.locked,
      archived: category.archived,
    };
  }

  private onEditCategory(row: object): void {
    const category = row as CategoryTableRow;
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
    const category = row as CategoryTableRow;
    if (isCategoryReadonly(category)) {
      return;
    }

    const translatedCategoryName = translateMaybe(this.translateService, category.name);
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
      this.categories.set(response.rows.map((category) => this.toCategoryTableRow(category)));
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
        this.categories.update((rows) =>
          rows.map((row) => (row.id === id ? this.toCategoryTableRow(result.row!) : row)),
        );
        dialogRef.close(result.row);
        toast.success(this.translateService.instant('categories.toasts.updateSuccess'));
        return;
      }

      if (result.changed > 0) {
        await this.loadCategories();
        dialogRef.close(null);
        toast.success(this.translateService.instant('categories.toasts.updateSuccess'));
        return;
      }

      dialogContent.setSubmitError('categories.dialog.edit.errors.updateFailed');
      toast.error(this.translateService.instant('categories.toasts.updateError'));
    } catch (error) {
      console.error('[categories-page] Failed to update category:', error);
      dialogContent.setSubmitError('categories.dialog.edit.errors.updateFailed');
      toast.error(this.translateService.instant('categories.toasts.updateError'));
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
        toast.success(this.translateService.instant('categories.toasts.archiveSuccess'));
        return;
      }

      await this.loadCategories();
      toast.error(this.translateService.instant('categories.toasts.archiveError'));
    } catch (error) {
      console.error('[categories-page] Failed to archive category:', error);
      toast.error(this.translateService.instant('categories.toasts.archiveError'));
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
        toast.error(this.translateService.instant('categories.toasts.createError'));
        return;
      }

      const targetPage = getTargetPageAfterCreate(this.total(), this.pageSize());
      this.page.set(targetPage);
      await this.loadCategories(targetPage);
      dialogRef.close(created);
      toast.success(this.translateService.instant('categories.toasts.createSuccess'));
    } catch (error) {
      console.error('[categories-page] Failed to create category:', error);
      dialogContent.setSubmitError('categories.dialog.add.errors.createFailed');
      toast.error(this.translateService.instant('categories.toasts.createError'));
    }
  }
}
