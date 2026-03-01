import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AppBaseCardComponent } from '@/components/base-card';
import { AppBarChartComponent, type AppBarChartSeries } from '@/components/charts';
import { AppDataTableComponent, type EditableOptionItem, type TableDataItem } from '@/components/data-table';
import {
  DEFAULT_VISUAL_COLOR_KEY,
  DEFAULT_VISUAL_ICON_KEY,
} from '@/config/visual-options.config';
import type {
  AnalyticsBudgetVsExpensesByCategoryByYearResponse,
  AnalyticsBudgetVsExpensesByCategoryByYearRowDto,
  BudgetCreateDto,
  BudgetUpdateDto,
} from '@/dtos';
import type { BudgetModel, CategoryModel } from '@/models';
import { resolveVisualColorHex } from '@/pages/overview-page/components/overview-cards.utils';
import { AnalyticsService } from '@/services/analytics.service';
import { BudgetsService } from '@/services/budgets.service';
import { CategoriesService } from '@/services/categories.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { NumberFormatService } from '@/services/number-format.service';
import {
  ToolbarContextService,
  type ToolbarAction,
  type ToolbarItemAction,
  type ToolbarItemNavigation,
} from '@/services/toolbar-context.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { ZardDialogService, type ZardDialogRef } from '@/shared/components/dialog';
import { ZardLoaderComponent } from '@/shared/components/loader';
import { ZardSkeletonComponent } from '@/shared/components/skeleton';
import {
  UpsertBudgetDialogComponent,
  type UpsertBudgetDialogData,
} from './components/upsert-budget-dialog/upsert-budget-dialog.component';

type BudgetSectionView = 'setup' | 'analysis';

const toEditableOptionIcon = (value: string | null): EditableOptionItem['icon'] =>
  value ? (value as EditableOptionItem['icon']) : undefined;

interface BudgetCategoryLookup {
  readonly name: string;
  readonly icon: string | null;
  readonly colorKey: string | null;
}

interface BudgetTableRow {
  readonly id: number;
  readonly categoryId: number;
  readonly categoryName: string;
  readonly categoryIcon: string | null;
  readonly categoryColorHex: string;
  readonly budgetYear: number;
  readonly amount: number;
  readonly description: string | null;
}

const BUDGET_COLUMN_WIDTH = {
  category: '3/10',
  year: '1/10',
  amount: '2/10',
  description: '3/10',
  action: '1/10',
} as const;

const BUDGET_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'common.labels.year',
    columnKey: 'budgetYear',
    type: 'number',
    number: {
      useGrouping: false,
    },
    sortable: true,
    minWidth: BUDGET_COLUMN_WIDTH.year,
    maxWidth: BUDGET_COLUMN_WIDTH.year,
  },
  {
    columnName: 'common.labels.category',
    columnKey: 'categoryName',
    type: 'badge',
    sortable: true,
    minWidth: BUDGET_COLUMN_WIDTH.category,
    maxWidth: BUDGET_COLUMN_WIDTH.category,
    badge: {
      type: 'secondary',
      shape: 'pill',
      icon: DEFAULT_VISUAL_ICON_KEY,
      iconColumnKey: 'categoryIcon',
      colorHexColumnKey: 'categoryColorHex',
      fullWidth: true,
    },
  },
  {
    columnName: 'common.labels.description',
    columnKey: 'description',
    type: 'string',
    sortable: true,
    minWidth: BUDGET_COLUMN_WIDTH.description,
    maxWidth: BUDGET_COLUMN_WIDTH.description,
  },
  {
    columnName: 'common.labels.amount',
    columnKey: 'amount',
    type: 'currency',
    sortable: true,
    minWidth: BUDGET_COLUMN_WIDTH.amount,
    maxWidth: BUDGET_COLUMN_WIDTH.amount,
  },
] as const;

const createBudgetTableStructure = (
  onEditAction: (row: object) => void | Promise<void>,
  onDeleteAction: (row: object) => void | Promise<void>,
): readonly TableDataItem[] =>
  [
    ...BUDGET_TABLE_COLUMNS,
    {
      minWidth: BUDGET_COLUMN_WIDTH.action,
      maxWidth: BUDGET_COLUMN_WIDTH.action,
      showLabel: false,
      actionItems: [
        {
          id: 'edit',
          icon: 'pencil',
          label: 'budgets.table.actions.edit',
          buttonType: 'ghost',
          action: onEditAction,
        },
        {
          id: 'delete',
          icon: 'trash',
          label: 'budgets.table.actions.delete',
          buttonType: 'ghost',
          action: onDeleteAction,
        },
      ],
    },
  ] as const;

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;
const MIN_YEAR = 1970;
const MAX_YEAR = 9999;
const AMOUNT_CENTS_DIVISOR = 100;
const ANALYSIS_CHART_MIN_HEIGHT_REM = 18;
const ANALYSIS_CHART_BASE_HEIGHT_REM = 6;
const ANALYSIS_CHART_ROW_HEIGHT_REM = 2.25;

interface BudgetAnalysisTotals {
  readonly budget_amount_cents: number;
  readonly expenses_total_cents: number;
  readonly delta_cents: number;
}

@Component({
  selector: 'app-budget-page',
  imports: [
    AppBaseCardComponent,
    AppBarChartComponent,
    AppDataTableComponent,
    TranslatePipe,
    ZardLoaderComponent,
    ZardSkeletonComponent,
  ],
  templateUrl: './budget-page.html',
})
export class BudgetPage implements OnInit, OnDestroy {
  private readonly currentCalendarYear = new Date().getFullYear();
  protected readonly activeSectionView = signal<BudgetSectionView>('setup');

  protected readonly budgets = signal<readonly BudgetTableRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly currencyCode = computed(() => this.localPreferencesService.currencyPreference());
  protected readonly budgetTableStructure = createBudgetTableStructure(
    (row) => this.onEditBudget(row),
    (row) => this.onDeleteBudget(row),
  );
  protected readonly analysisYear = signal(this.currentCalendarYear);
  protected readonly analysisYearOptions = signal<readonly { value: string; label: string }[]>([
    {
      value: String(this.currentCalendarYear),
      label: String(this.currentCalendarYear),
    },
  ]);
  protected readonly analysisRows = signal<readonly AnalyticsBudgetVsExpensesByCategoryByYearRowDto[]>([]);
  protected readonly analysisTotals = signal<BudgetAnalysisTotals>({
    budget_amount_cents: 0,
    expenses_total_cents: 0,
    delta_cents: 0,
  });
  protected readonly analysisLoading = signal(false);
  protected readonly analysisError = signal<string | null>(null);
  protected readonly analysisHasData = computed(() => this.analysisRows().length > 0);
  protected readonly analysisChartLabels = computed<readonly string[]>(() =>
    this.analysisRows().map((row) => row.category_name),
  );
  protected readonly analysisChartSeries = computed<readonly AppBarChartSeries[]>(() => {
    const rows = this.analysisRows();
    if (rows.length === 0) {
      return [];
    }
    const budgetDataColors = rows.map((row) => {
      const categoryLookup = this.categoryLookupById.get(Number(row.category_id));
      return resolveVisualColorHex(categoryLookup?.colorKey);
    });

    return [
      {
        name: this.translateService.instant('budgets.analysis.series.budget'),
        data: rows.map((row) => this.toAmount(row.budget_amount_cents)),
        dataColors: budgetDataColors,
        themeColor: 'chart-5',
      },
      {
        name: this.translateService.instant('budgets.analysis.series.expenses'),
        data: rows.map((row) => this.toAmount(row.expenses_total_cents)),
        themeColor: 'chart-expense',
      },
    ] as const;
  });
  protected readonly analysisAxisTooltipDetailsByIndex = computed<readonly (readonly string[] | undefined)[]>(() => {
    const label = this.translateService.instant('budgets.analysis.metrics.availablePercent');

    return this.analysisRows().map((row) => {
      const budgetAmountCents = Number(row.budget_amount_cents ?? 0);
      const expensesTotalCents = Number(row.expenses_total_cents ?? 0);
      if (budgetAmountCents <= 0) {
        return [`${label}: -`];
      }

      const availablePercent = ((budgetAmountCents - expensesTotalCents) / budgetAmountCents) * 100;
      return [`${label}: ${this.formatPercent(availablePercent)}`];
    });
  });
  protected readonly analysisChartHeight = computed(() => {
    const rowsCount = this.analysisRows().length;
    const height = ANALYSIS_CHART_BASE_HEIGHT_REM + rowsCount * ANALYSIS_CHART_ROW_HEIGHT_REM;
    return `${Math.max(ANALYSIS_CHART_MIN_HEIGHT_REM, height)}rem`;
  });

  private readonly categoryOptions = signal<readonly EditableOptionItem[]>([]);
  private readonly categoryLookupById = new Map<number, BudgetCategoryLookup>();
  private analysisLoadRequestId = 0;

  private readonly setupToolbarActions: readonly ToolbarAction[] = [
    {
      id: 'add-budget',
      label: 'budgets.table.actions.add',
      icon: 'plus',
      buttonType: 'default',
      action: () => this.openAddBudgetDialog(),
    },
  ];

  private readonly toolbarItemNavigation = computed<ToolbarItemNavigation>(() => ({
    id: 'budget-sections-view',
    type: 'segmented',
    ariaLabel: 'Budget sections',
    size: 'sm',
    defaultValue: this.activeSectionView(),
    options: [
      { value: 'setup', label: 'budgets.view.setup' },
      { value: 'analysis', label: 'budgets.view.analysis' },
    ],
    change: (value) => this.onSectionViewChange(value),
  }));

  private readonly toolbarItemActions = computed<readonly ToolbarItemAction[]>(() => {
    const actions: ToolbarItemAction[] = [];

    if (this.activeSectionView() === 'analysis') {
      actions.push({
        id: 'budget-analysis-year',
        type: 'select',
        label: 'breakdown.toolbar.selectYear',
        ariaLabel: 'Budget analysis year',
        size: 'sm',
        class: 'w-28 shrink-0',
        value: () => String(this.analysisYear()),
        options: this.analysisYearOptions(),
        change: (value) => this.onAnalysisYearChange(value),
      });
    }

    if (this.activeSectionView() === 'setup') {
      actions.push(...this.setupToolbarActions);
    }

    return actions;
  });

  private releaseToolbarActions: (() => void) | null = null;

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly budgetsService: BudgetsService,
    private readonly categoriesService: CategoriesService,
    private readonly localPreferencesService: LocalPreferencesService,
    private readonly numberFormatService: NumberFormatService,
    private readonly toolbarContextService: ToolbarContextService,
    private readonly alertDialogService: ZardAlertDialogService,
    private readonly dialogService: ZardDialogService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    this.activateToolbar();
    void this.loadInitialData();
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
    void this.loadBudgets(nextPage);
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
    void this.loadBudgets(1);
  }

  private onSectionViewChange(value: string): void {
    const nextView: BudgetSectionView = value === 'analysis' ? 'analysis' : 'setup';
    if (nextView === this.activeSectionView()) {
      return;
    }

    this.activeSectionView.set(nextView);
    this.activateToolbar();

    if (nextView === 'analysis') {
      void this.loadBudgetAnalysis();
    }
  }

  private onAnalysisYearChange(value: string): void {
    const nextYear = Number.parseInt(value, 10);
    const yearOptions = this.analysisYearOptions();
    const isAllowedYear = yearOptions.some((option) => Number.parseInt(option.value, 10) === nextYear);

    if (!Number.isInteger(nextYear) || !isAllowedYear || nextYear === this.analysisYear()) {
      return;
    }

    this.analysisYear.set(nextYear);
    void this.loadBudgetAnalysis();
  }

  private activateToolbar(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.budget',
      itemNavigation: this.toolbarItemNavigation(),
      itemActions: this.toolbarItemActions(),
    });
  }

  private applyAnalysisYearOptions(yearsInput: readonly number[]): void {
    const years = Array.from(new Set(
      yearsInput
        .map((year) => Number(year))
        .filter((year) => Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR),
    )).sort((left, right) => right - left);

    if (years.length === 0) {
      years.push(this.currentCalendarYear);
    }

    const previousYear = this.analysisYear();
    if (!years.includes(previousYear)) {
      this.analysisYear.set(years[0]!);
    }

    this.analysisYearOptions.set(
      years.map((year) => ({
        value: String(year),
        label: String(year),
      })),
    );

    if (this.activeSectionView() === 'analysis') {
      this.activateToolbar();

      if (!this.analysisHasData() || this.analysisYear() !== previousYear) {
        void this.loadBudgetAnalysis();
      }
    }
  }

  private toBudgetYears(rows: readonly BudgetModel[]): readonly number[] {
    return rows
      .map((row) => new Date(row.createdAt).getFullYear())
      .filter((year) => Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR);
  }

  private async loadBudgetYears(): Promise<void> {
    try {
      const rows = await this.budgetsService.listAll({
        where: {
          archived: 0,
        },
        options: {
          orderBy: 'created_at',
          orderDirection: 'DESC',
        },
      });
      this.applyAnalysisYearOptions(this.toBudgetYears(rows));
    } catch (error) {
      console.warn('[budget-page] Failed to load budget years for analysis:', error);
      this.applyAnalysisYearOptions([this.analysisYear(), this.currentCalendarYear]);
    }
  }

  private toBudgetTableRow(budget: BudgetModel): BudgetTableRow {
    const categoryLookup = this.categoryLookupById.get(budget.categoryId);
    const categoryName = categoryLookup
      ? this.translateMaybe(categoryLookup.name)
      : this.translateService.instant('budgets.table.unknownCategory');
    const budgetYear = new Date(budget.createdAt).getFullYear();

    return {
      id: budget.id,
      categoryId: budget.categoryId,
      categoryName,
      categoryIcon: categoryLookup?.icon ?? DEFAULT_VISUAL_ICON_KEY,
      categoryColorHex: `var(--${categoryLookup?.colorKey ?? DEFAULT_VISUAL_COLOR_KEY})`,
      budgetYear,
      amount: budget.amount,
      description: budget.description,
    };
  }

  private toCategoryOption(category: CategoryModel): EditableOptionItem {
    return {
      label: category.name,
      value: category.id,
      icon: toEditableOptionIcon(category.icon),
      colorHex: `var(--${category.colorKey ?? DEFAULT_VISUAL_COLOR_KEY})`,
    };
  }

  private applyCategories(categories: readonly CategoryModel[]): void {
    this.categoryLookupById.clear();

    for (const category of categories) {
      this.categoryLookupById.set(category.id, {
        name: category.name,
        icon: category.icon,
        colorKey: category.colorKey,
      });
    }

    this.categoryOptions.set(
      categories
        .filter((category) => category.type === 'expense')
        .map((category) => this.toCategoryOption(category)),
    );
  }

  private applyBudgetsPage(rows: readonly BudgetModel[], total: number, page: number): void {
    this.budgets.set(rows.map((budget) => this.toBudgetTableRow(budget)));
    this.total.set(total);
    this.page.set(page);
  }

  private async loadInitialData(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const [categories, budgets, allBudgets] = await Promise.all([
        this.categoriesService.listAll({
          where: {
            archived: 0,
          },
          options: {
            orderBy: 'id',
            orderDirection: 'ASC',
          },
        }),
        this.budgetsService.list({
          where: {
            archived: 0,
          },
          page: this.page(),
          page_size: this.pageSize(),
          options: {
            orderBy: 'id',
            orderDirection: 'ASC',
          },
        }),
        this.budgetsService.listAll({
          where: {
            archived: 0,
          },
          options: {
            orderBy: 'created_at',
            orderDirection: 'DESC',
          },
        }).catch((error) => {
          console.warn('[budget-page] Failed to preload budget years:', error);
          return [];
        }),
      ]);

      this.applyCategories(categories);
      this.applyBudgetsPage(budgets.rows, budgets.total, budgets.page);
      this.applyAnalysisYearOptions(this.toBudgetYears(allBudgets));
    } catch (error) {
      this.budgets.set([]);
      this.total.set(0);
      this.page.set(1);
      this.applyAnalysisYearOptions([this.currentCalendarYear]);
      this.categoryOptions.set([]);
      this.categoryLookupById.clear();
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading budgets.');
      console.error('[budget-page] Failed to load initial budget data:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadBudgets(page = this.page()): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const response = await this.budgetsService.list({
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

      this.applyBudgetsPage(response.rows, response.total, response.page);
    } catch (error) {
      this.budgets.set([]);
      this.total.set(0);
      this.page.set(1);
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading budgets.');
      console.error('[budget-page] Failed to load budgets:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private onEditBudget(row: object): void {
    const budget = row as BudgetTableRow;

    let isUpdatingBudget = false;

    const dialogRef = this.dialogService.create<UpsertBudgetDialogComponent, UpsertBudgetDialogData>({
      zTitle: this.translateService.instant('budgets.dialog.edit.title'),
      zDescription: this.translateService.instant('budgets.dialog.edit.description', { year: budget.budgetYear }),
      zContent: UpsertBudgetDialogComponent,
      zData: {
        categoryOptions: this.categoryOptions(),
        budget: {
          categoryId: budget.categoryId,
          amount: budget.amount,
          description: budget.description,
        },
      },
      zWidth: 'min(96vw, 720px)',
      zMaskClosable: true,
      zOkText: this.translateService.instant('budgets.dialog.edit.actions.save'),
      zCancelText: this.translateService.instant('budgets.dialog.edit.actions.cancel'),
      zOkIcon: 'pencil',
      zOnOk: (dialogContent) => {
        if (isUpdatingBudget) {
          return false;
        }

        const changes = dialogContent.collectUpdateChanges();
        if (!changes) {
          return false;
        }

        isUpdatingBudget = true;
        void this
          .updateBudgetFromDialog(budget.id, changes, dialogContent, dialogRef)
          .finally(() => {
            isUpdatingBudget = false;
          });
        return false;
      },
    });
  }

  private onDeleteBudget(row: object): void {
    const budget = row as BudgetTableRow;

    this.alertDialogService.confirm({
      zTitle: this.translateService.instant('budgets.deleteAlert.title'),
      zDescription: this.translateService.instant('budgets.deleteAlert.description', {
        category: budget.categoryName,
      }),
      zOkText: this.translateService.instant('budgets.deleteAlert.actions.delete'),
      zCancelText: this.translateService.instant('budgets.deleteAlert.actions.cancel'),
      zOkDestructive: true,
      zMaskClosable: true,
      zClosable: true,
      zOnOk: () => {
        void this.deleteBudget(budget.id);
      },
    });
  }

  private openAddBudgetDialog(): void {
    let isCreatingBudget = false;

    const dialogRef = this.dialogService.create<UpsertBudgetDialogComponent, UpsertBudgetDialogData>({
      zTitle: this.translateService.instant('budgets.dialog.add.title'),
      zDescription: this.translateService.instant('budgets.dialog.add.description', {
        year: this.currentCalendarYear,
      }),
      zContent: UpsertBudgetDialogComponent,
      zData: {
        categoryOptions: this.categoryOptions(),
      },
      zWidth: 'min(96vw, 720px)',
      zMaskClosable: true,
      zOkText: this.translateService.instant('budgets.dialog.add.actions.create'),
      zCancelText: this.translateService.instant('budgets.dialog.add.actions.cancel'),
      zOkIcon: 'plus',
      zOnOk: (dialogContent) => {
        if (isCreatingBudget) {
          return false;
        }

        const payload = dialogContent.collectCreatePayload();
        if (!payload) {
          return false;
        }

        isCreatingBudget = true;
        void this
          .createBudget(payload, dialogContent, dialogRef)
          .finally(() => {
            isCreatingBudget = false;
          });
        return false;
      },
    });
  }

  private async updateBudgetFromDialog(
    id: number,
    changes: BudgetUpdateDto['changes'],
    dialogContent: UpsertBudgetDialogComponent,
    dialogRef: ZardDialogRef<UpsertBudgetDialogComponent>,
  ): Promise<void> {
    try {
      const result = await this.budgetsService.update({ id, changes });

      if (result.row) {
        this.budgets.update((rows) =>
          rows.map((row) => (row.id === id ? this.toBudgetTableRow(result.row!) : row)),
        );
        dialogRef.close(result.row);
        return;
      }

      if (result.changed > 0) {
        await this.loadBudgets();
        dialogRef.close(null);
        return;
      }

      dialogContent.setSubmitError('budgets.dialog.edit.errors.updateFailed');
    } catch (error) {
      console.error('[budget-page] Failed to update budget:', error);
      dialogContent.setSubmitError('budgets.dialog.edit.errors.updateFailed');
    }
  }

  private async deleteBudget(id: number): Promise<void> {
    try {
      const result = await this.budgetsService.remove({ id });
      if (result.changed > 0) {
        await this.loadBudgets();
        await this.loadBudgetYears();
        return;
      }

      await this.loadBudgets();
      await this.loadBudgetYears();
    } catch (error) {
      console.error('[budget-page] Failed to delete budget:', error);
      await this.loadBudgets();
    }
  }

  private async createBudget(
    payload: BudgetCreateDto,
    dialogContent: UpsertBudgetDialogComponent,
    dialogRef: ZardDialogRef<UpsertBudgetDialogComponent>,
  ): Promise<void> {
    try {
      const created = await this.budgetsService.create(payload);
      if (!created) {
        dialogContent.setSubmitError('budgets.dialog.add.errors.createFailed');
        return;
      }

      const nextTotal = this.total() + 1;
      const targetPage = Math.max(1, Math.ceil(nextTotal / this.pageSize()));
      this.page.set(targetPage);
      await this.loadBudgets(targetPage);
      await this.loadBudgetYears();
      dialogRef.close(created);
    } catch (error) {
      console.error('[budget-page] Failed to create budget:', error);
      dialogContent.setSubmitError('budgets.dialog.add.errors.createFailed');
    }
  }

  private async loadBudgetAnalysis(): Promise<void> {
    const year = this.analysisYear();
    const requestId = ++this.analysisLoadRequestId;

    this.analysisLoading.set(true);
    this.analysisError.set(null);

    try {
      const response = await this.analyticsService.budgetVsExpensesByCategoryByYear({ year });
      if (requestId !== this.analysisLoadRequestId) {
        return;
      }

      this.applyBudgetAnalysisResponse(response);
    } catch (error) {
      if (requestId !== this.analysisLoadRequestId) {
        return;
      }

      this.analysisRows.set([]);
      this.analysisTotals.set({
        budget_amount_cents: 0,
        expenses_total_cents: 0,
        delta_cents: 0,
      });
      this.analysisError.set(error instanceof Error ? error.message : 'Unexpected error while loading budget analysis.');
      console.error('[budget-page] Failed to load budget analysis:', error);
    } finally {
      if (requestId === this.analysisLoadRequestId) {
        this.analysisLoading.set(false);
      }
    }
  }

  private applyBudgetAnalysisResponse(response: AnalyticsBudgetVsExpensesByCategoryByYearResponse): void {
    const normalizedRows = [...(response.rows ?? [])].sort((left, right) =>
      String(left.category_name).localeCompare(String(right.category_name)),
    );
    const totals = response.totals ?? {
      budget_amount_cents: 0,
      expenses_total_cents: 0,
      delta_cents: 0,
    };

    this.analysisRows.set(normalizedRows);
    this.analysisTotals.set({
      budget_amount_cents: Number(totals.budget_amount_cents ?? 0),
      expenses_total_cents: Number(totals.expenses_total_cents ?? 0),
      delta_cents: Number(totals.delta_cents ?? 0),
    });
  }

  protected formatCurrency(amount: number): string {
    return this.numberFormatService.formatCurrency(amount, this.currencyCode());
  }

  protected formatSignedCurrency(amount: number): string {
    if (amount === 0) {
      return this.formatCurrency(0);
    }

    const sign = amount > 0 ? '+' : '-';
    return `${sign}${this.formatCurrency(Math.abs(amount))}`;
  }

  private formatPercent(value: number): string {
    const normalizedValue = Number.isFinite(value) ? value : 0;
    return this.numberFormatService.formatPercent(normalizedValue, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  protected analysisBudgetTotalAmount(): number {
    return this.toAmount(this.analysisTotals().budget_amount_cents);
  }

  protected analysisExpensesTotalAmount(): number {
    return this.toAmount(this.analysisTotals().expenses_total_cents);
  }

  protected analysisDeltaAmount(): number {
    return this.toAmount(this.analysisTotals().delta_cents);
  }

  protected analysisYearLabel(): string {
    return this.translateService.instant('breakdown.sectionYear', { year: this.analysisYear() });
  }

  private toAmount(amountCents: number): number {
    return Number(amountCents ?? 0) / AMOUNT_CENTS_DIVISOR;
  }

  private translateMaybe(value: string): string {
    const translated = this.translateService.instant(value);
    return translated !== value ? translated : value;
  }
}
