import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { AppDataTableComponent, type TableDataItem } from '@/components/data-table';
import {
  DEFAULT_VISUAL_COLOR_KEY,
  DEFAULT_VISUAL_ICON_KEY,
} from '@/config/visual-options.config';
import type { CategoryModel } from '@/models';
import { CategoriesService } from '@/services/categories.service';
import { Z_MODAL_DATA } from '@/shared/components/dialog';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import { createActionColumn } from '@/shared/utils';

export interface ManageArchivedCategoriesDialogData {
  readonly onCategoryUnarchived: () => void | Promise<void>;
}

interface ArchivedCategoryTableRow {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly colorHex: string;
  readonly icon: string | null;
  readonly typeLabel: string;
  readonly typeColorHex: string | null;
}

const CATEGORY_TYPE_COLOR_HEX_BY_TYPE: Record<CategoryModel['type'], string | null> = {
  income: 'var(--chart-income)',
  expense: 'var(--chart-expense)',
  exclude: null,
};

const ARCHIVED_CATEGORY_COLUMN_WIDTH = {
  name: '3/10',
  type: '2/10',
  description: '4/10',
  action: '1/10',
} as const;

const ARCHIVED_CATEGORY_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'common.labels.name',
    columnKey: 'name',
    type: 'badge',
    sortable: true,
    minWidth: ARCHIVED_CATEGORY_COLUMN_WIDTH.name,
    maxWidth: ARCHIVED_CATEGORY_COLUMN_WIDTH.name,
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
    minWidth: ARCHIVED_CATEGORY_COLUMN_WIDTH.type,
    maxWidth: ARCHIVED_CATEGORY_COLUMN_WIDTH.type,
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
    minWidth: ARCHIVED_CATEGORY_COLUMN_WIDTH.description,
    maxWidth: ARCHIVED_CATEGORY_COLUMN_WIDTH.description,
  },
] as const;

const createArchivedCategoryTableStructure = (
  onUnarchiveAction: (row: object) => void | Promise<void>,
  isActionDisabled: () => boolean,
): readonly TableDataItem[] =>
  [
    ...ARCHIVED_CATEGORY_TABLE_COLUMNS,
    createActionColumn(ARCHIVED_CATEGORY_COLUMN_WIDTH.action, [
      {
        id: 'unarchive-category',
        icon: 'arrow-left',
        label: 'categories.archivedDialog.actions.unarchive',
        buttonType: 'ghost',
        disabled: isActionDisabled,
        action: onUnarchiveAction,
      },
    ]),
  ] as const;

@Component({
  selector: 'app-manage-archived-categories-dialog',
  imports: [AppDataTableComponent, TranslatePipe, ZardSkeletonComponent],
  templateUrl: './manage-archived-categories-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageArchivedCategoriesDialogComponent implements OnInit {
  private readonly categoriesService = inject(CategoriesService);
  private readonly data = inject<ManageArchivedCategoriesDialogData>(Z_MODAL_DATA);
  private readonly translateService = inject(TranslateService);

  protected readonly categories = signal<readonly ArchivedCategoryTableRow[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly unarchivingCategoryId = signal<number | null>(null);
  protected readonly tableStructure = createArchivedCategoryTableStructure(
    (row) => this.onUnarchiveCategory(row),
    () => this.unarchivingCategoryId() !== null,
  );

  ngOnInit(): void {
    void this.loadArchivedCategories();
  }

  private toArchivedCategoryTableRow(category: CategoryModel): ArchivedCategoryTableRow {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      colorHex: `var(--${category.colorKey ?? DEFAULT_VISUAL_COLOR_KEY})`,
      icon: category.icon,
      typeLabel: `category.type.${category.type}`,
      typeColorHex: CATEGORY_TYPE_COLOR_HEX_BY_TYPE[category.type],
    };
  }

  private onUnarchiveCategory(row: object): void {
    if (this.unarchivingCategoryId() !== null) {
      return;
    }

    const category = row as ArchivedCategoryTableRow;
    void this.unarchiveCategory(category.id);
  }

  private async loadArchivedCategories(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const categories = await this.categoriesService.listAll({
        where: {
          archived: 1,
        },
        options: {
          orderBy: 'id',
          orderDirection: 'ASC',
        },
      });

      this.categories.set(categories.map((category) => this.toArchivedCategoryTableRow(category)));
    } catch (error) {
      this.categories.set([]);
      this.loadError.set(
        error instanceof Error ? error.message : 'Unexpected error while loading archived categories.',
      );
      console.error('[manage-archived-categories-dialog] Failed to load archived categories:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async unarchiveCategory(id: number): Promise<void> {
    this.unarchivingCategoryId.set(id);

    try {
      const result = await this.categoriesService.update({
        id,
        changes: {
          archived: false,
        },
      });

      if ((result.row && !result.row.archived) || result.changed > 0) {
        this.categories.update((rows) => rows.filter((row) => row.id !== id));
        await this.data.onCategoryUnarchived();
        toast.success(this.translateService.instant('categories.toasts.unarchiveSuccess'));
        return;
      }

      await this.loadArchivedCategories();
      toast.error(this.translateService.instant('categories.toasts.unarchiveError'));
    } catch (error) {
      console.error('[manage-archived-categories-dialog] Failed to unarchive category:', error);
      toast.error(this.translateService.instant('categories.toasts.unarchiveError'));
      await this.loadArchivedCategories();
    } finally {
      this.unarchivingCategoryId.set(null);
    }
  }
}
