import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import {
  AppDataTableComponent,
  type EditableOptionItem,
  type TableCurrencyIconMode,
  type TableDataItem,
} from '@/components/data-table';
import { DEFAULT_VISUAL_COLOR_KEY } from '@/config/visual-options.config';
import type { PlanItemCreateDto, PlanItemMonthPolicy } from '@/dtos';
import { centsToAmount, type PlanItemModel, toBooleanFlag } from '@/models';
import { AccountsService } from '@/services/accounts.service';
import { CategoriesService } from '@/services/categories.service';
import { PlanItemsService, type PlanItemRunResult } from '@/services/plan-items.service';
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
  getTargetPageAfterDelete,
  toEditableOptionIcon,
  translateMaybe,
} from '@/shared/utils';
import { DeleteRecurringEventAlertContentComponent } from './components/delete-recurring-event-alert-content/delete-recurring-event-alert-content.component';
import {
  RecurringEventRunResultAlertContentComponent,
  type RecurringEventRunResultAlertData,
} from './components/recurring-event-run-result-alert-content/recurring-event-run-result-alert-content.component';
import {
  UpsertPlanItemDialogComponent,
  type PlanItemDialogInitialValue,
  type UpsertPlanItemDialogData,
} from './components/upsert-plan-item-dialog/upsert-plan-item-dialog.component';

interface RecurringEventTableRow {
  readonly id: number;
  readonly title: string;
  readonly type: PlanItemModel['type'];
  readonly typeLabel: string;
  readonly startDate: number;
  readonly schedule: string;
  readonly amount: number;
  readonly amountCurrencyIconMode: TableCurrencyIconMode;
  readonly templateSummary: string;
  readonly settled: boolean;
}

const RECURRING_EVENT_COLUMN_WIDTH = {
  title: '2/12',
  type: '1/12',
  startDate: '1/9',
  schedule: '3/12',
  amount: '1/12',
  action: '1/12',
} as const;

const RECURRING_EVENT_TABLE_COLUMNS: readonly TableDataItem[] = [
  {
    columnName: 'common.labels.title',
    columnKey: 'title',
    type: 'string',
    sortable: true,
    minWidth: RECURRING_EVENT_COLUMN_WIDTH.title,
    maxWidth: RECURRING_EVENT_COLUMN_WIDTH.title,
  },
  {
    columnName: 'common.labels.type',
    columnKey: 'typeLabel',
    type: 'badge',
    sortable: true,
    minWidth: RECURRING_EVENT_COLUMN_WIDTH.type,
    maxWidth: RECURRING_EVENT_COLUMN_WIDTH.type,
    badge: {
      type: 'secondary',
      shape: 'pill',
    },
  },
  {
    columnName: 'common.labels.startDate',
    columnKey: 'startDate',
    type: 'date',
    sortable: true,
    minWidth: RECURRING_EVENT_COLUMN_WIDTH.startDate,
    maxWidth: RECURRING_EVENT_COLUMN_WIDTH.startDate,
  },
  {
    columnName: 'common.labels.plan',
    columnKey: 'schedule',
    type: 'string',
    sortable: true,
    minWidth: RECURRING_EVENT_COLUMN_WIDTH.schedule,
    maxWidth: RECURRING_EVENT_COLUMN_WIDTH.schedule,
  },
  {
    columnName: 'common.labels.amount',
    columnKey: 'amount',
    type: 'currency',
    sortable: true,
    minWidth: RECURRING_EVENT_COLUMN_WIDTH.amount,
    maxWidth: RECURRING_EVENT_COLUMN_WIDTH.amount,
    currency: {
      iconModeColumnKey: 'amountCurrencyIconMode',
    },
  },
] as const;

const createRecurringEventTableStructure = (
  onEditAction: (row: object) => void | Promise<void>,
  onDeleteAction: (row: object) => void | Promise<void>,
): readonly TableDataItem[] =>
  [
    ...RECURRING_EVENT_TABLE_COLUMNS,
    createActionColumn(RECURRING_EVENT_COLUMN_WIDTH.action, [
      {
        id: 'edit',
        icon: 'pencil',
        label: 'recurringEvents.table.actions.edit',
        buttonType: 'ghost',
        action: onEditAction,
      },
      {
        id: 'delete',
        icon: 'trash',
        label: 'recurringEvents.table.actions.delete',
        buttonType: 'ghost',
        action: onDeleteAction,
      },
    ]),
  ] as const;

function isPlanItemCreateAndRunResult(
  value: Awaited<ReturnType<PlanItemsService['create']>>,
): value is Exclude<Awaited<ReturnType<PlanItemsService['create']>>, PlanItemModel> {
  return Boolean(value && typeof value === 'object' && 'row' in value && 'run' in value);
}

@Component({
  selector: 'app-recurring-events-page',
  imports: [AppDataTableComponent, TranslatePipe, ZardSkeletonComponent],
  templateUrl: './recurring-events-page.html',
})
export class RecurringEventsPage implements OnInit, OnDestroy {
  protected readonly rows = signal<readonly RecurringEventTableRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly pageCount = computed(() => computePageCount(this.total(), this.pageSize()));
  protected readonly accountCount = computed(() => this.accountOptions().length);
  protected readonly emptyMessageKey = computed(() =>
    this.accountCount() === 0
      ? 'recurringEvents.table.emptyNoAccountsMessage'
      : 'recurringEvents.table.emptyMessage',
  );
  protected readonly emptyActionLabelKey = computed(() =>
    this.accountCount() === 0 ? 'accounts.table.actions.add' : 'recurringEvents.table.actions.add',
  );
  protected readonly recurringEventTableStructure = createRecurringEventTableStructure(
    (row) => this.onEditRecurringEvent(row),
    (row) => this.onDeleteRecurringEvent(row),
  );

  private readonly accountOptions = signal<readonly EditableOptionItem[]>([]);
  private readonly categoryOptions = signal<readonly EditableOptionItem[]>([]);
  private readonly planItemById = signal<ReadonlyMap<number, PlanItemModel>>(new Map());
  private readonly accountNameById = new Map<number, string>();
  private readonly categoryNameById = new Map<number, string>();

  private readonly toolbarActions: readonly ToolbarAction[] = [
    {
      id: 'add-recurring-event',
      label: 'recurringEvents.table.actions.add',
      icon: 'plus',
      buttonType: 'default',
      action: () => this.openAddRecurringEventDialog(),
    },
  ];

  private releaseToolbarActions: (() => void) | null = null;

  constructor(
    private readonly router: Router,
    private readonly planItemsService: PlanItemsService,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly toolbarContextService: ToolbarContextService,
    private readonly alertDialogService: ZardAlertDialogService,
    private readonly dialogService: ZardDialogService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.recurringEvents',
      itemActions: this.toolbarActions,
    });
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
    void this.loadRecurringEvents(nextPage);
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
    void this.loadRecurringEvents(1);
  }

  protected onEmptyActionClick(): void {
    if (this.accountCount() === 0) {
      void this.router.navigate(['/accounts']);
      return;
    }

    this.openAddRecurringEventDialog();
  }

  private async loadInitialData(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const [accounts, categories, planItems] = await Promise.all([
        this.accountsService.listAll({
          where: {
            archived: 0,
          },
          options: {
            orderBy: 'id',
            orderDirection: 'ASC',
          },
        }),
        this.categoriesService.listAll({
          where: {
            archived: 0,
          },
          options: {
            orderBy: 'id',
            orderDirection: 'ASC',
          },
        }),
        this.planItemsService.list({
          page: this.page(),
          page_size: this.pageSize(),
        }),
      ]);

      this.accountNameById.clear();
      this.categoryNameById.clear();
      for (const account of accounts) {
        this.accountNameById.set(account.id, account.name);
      }
      for (const category of categories) {
        this.categoryNameById.set(category.id, category.name);
      }

      this.accountOptions.set(
        accounts.map((account) => ({
          label: account.name,
          value: account.id,
          icon: toEditableOptionIcon(account.icon),
          colorHex: `var(--${account.colorKey ?? DEFAULT_VISUAL_COLOR_KEY})`,
        })),
      );
      this.categoryOptions.set(
        categories.map((category) => ({
          label: category.name,
          value: category.id,
          icon: toEditableOptionIcon(category.icon),
          colorHex: `var(--${category.colorKey ?? DEFAULT_VISUAL_COLOR_KEY})`,
        })),
      );

      this.applyPlanItemsPage(planItems.rows, planItems.total, planItems.page);
    } catch (error) {
      this.rows.set([]);
      this.planItemById.set(new Map());
      this.total.set(0);
      this.page.set(1);
      this.accountOptions.set([]);
      this.categoryOptions.set([]);
      this.accountNameById.clear();
      this.categoryNameById.clear();
      this.loadError.set(
        error instanceof Error ? error.message : this.translateService.instant('recurringEvents.errors.loadUnexpected'),
      );
      console.error('[recurring-events-page] Failed to load recurring events:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadRecurringEvents(page = this.page()): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const response = await this.planItemsService.list({
        page,
        page_size: this.pageSize(),
      });

      this.applyPlanItemsPage(response.rows, response.total, response.page);
    } catch (error) {
      this.rows.set([]);
      this.planItemById.set(new Map());
      this.total.set(0);
      this.page.set(1);
      this.loadError.set(
        error instanceof Error ? error.message : this.translateService.instant('recurringEvents.errors.loadUnexpected'),
      );
      console.error('[recurring-events-page] Failed to load recurring events:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private applyPlanItemsPage(rows: readonly PlanItemModel[], total: number, page: number): void {
    const planItemById = new Map<number, PlanItemModel>();
    for (const row of rows) {
      planItemById.set(row.id, row);
    }

    this.planItemById.set(planItemById);
    this.rows.set(rows.map((row) => this.toRecurringEventTableRow(row)));
    this.total.set(total);
    this.page.set(page);
  }

  private toRecurringEventTableRow(planItem: PlanItemModel): RecurringEventTableRow {
    const amount = centsToAmount(planItem.templateJson.amount_cents);
    return {
      id: planItem.id,
      title: planItem.title,
      type: planItem.type,
      typeLabel: `recurringEvents.type.${planItem.type}`,
      startDate: planItem.ruleJson.start_date,
      schedule: this.describeSchedule(planItem),
      amount,
      amountCurrencyIconMode: planItem.type === 'transfer' ? 'transfer' : 'currency-trend',
      templateSummary: this.describeTemplate(planItem),
      settled: planItem.templateJson.settled !== undefined ? toBooleanFlag(planItem.templateJson.settled) : false,
    };
  }

  private describeSchedule(planItem: PlanItemModel): string {
    const rule = planItem.ruleJson;
    return this.translateService.instant('recurringEvents.table.schedule.summary', {
      count: rule.count,
      interval: rule.frequency.interval,
      unit: this.translateService.instant(`recurringEvents.frequency.unit.${rule.frequency.unit}`),
    });
  }

  private describeTemplate(planItem: PlanItemModel): string {
    if (planItem.type === 'transaction' && 'account_id' in planItem.templateJson && 'category_id' in planItem.templateJson) {
      const categoryName = this.lookupCategoryName(planItem.templateJson.category_id);
      const accountName = this.lookupAccountName(planItem.templateJson.account_id);
      const description = planItem.templateJson.description.trim();
      const parts = [`${categoryName} @ ${accountName}`];

      if (description.length > 0) {
        parts.push(description);
      }

      return parts.join(' | ');
    }

    if ('from_account_id' in planItem.templateJson && 'to_account_id' in planItem.templateJson) {
      const fromAccountName = this.lookupAccountName(planItem.templateJson.from_account_id);
      const toAccountName = this.lookupAccountName(planItem.templateJson.to_account_id);
      const description = planItem.templateJson.description.trim();
      const parts = [`${fromAccountName} -> ${toAccountName}`];

      if (description.length > 0) {
        parts.push(description);
      }

      return parts.join(' | ');
    }

    return this.translateService.instant('recurringEvents.table.template.unknown');
  }

  private lookupAccountName(accountId: number): string {
    const name = this.accountNameById.get(accountId);
    if (!name) {
      return this.translateService.instant('recurringEvents.table.template.unknownAccount');
    }

    return translateMaybe(this.translateService, name);
  }

  private lookupCategoryName(categoryId: number): string {
    const name = this.categoryNameById.get(categoryId);
    if (!name) {
      return this.translateService.instant('recurringEvents.table.template.unknownCategory');
    }

    return translateMaybe(this.translateService, name);
  }

  private onEditRecurringEvent(row: object): void {
    const recurringEvent = row as RecurringEventTableRow;
    const planItem = this.planItemById().get(recurringEvent.id);
    if (!planItem) {
      return;
    }

    let isUpdatingPlanItem = false;

    const dialogRef = this.dialogService.create<UpsertPlanItemDialogComponent, UpsertPlanItemDialogData>({
      zTitle: this.translateService.instant('recurringEvents.dialog.edit.title'),
      zDescription: this.translateService.instant('recurringEvents.dialog.edit.description'),
      zContent: UpsertPlanItemDialogComponent,
      zData: {
        accountOptions: this.accountOptions(),
        categoryOptions: this.categoryOptions(),
        planItem: this.toDialogInitialValue(planItem),
      },
      zWidth: 'min(calc(100dvw - 120px), 1040px)',
      zCustomClasses: 'max-h-[calc(100dvh-120px)] max-w-[calc(100dvw-120px)] sm:max-w-[calc(100dvw-120px)]',
      zMaskClosable: true,
      zOkText: this.translateService.instant('recurringEvents.dialog.edit.actions.save'),
      zCancelText: this.translateService.instant('recurringEvents.dialog.edit.actions.cancel'),
      zOkIcon: 'pencil',
      zOnOk: (dialogContent) => {
        if (isUpdatingPlanItem) {
          return false;
        }

        const changes = dialogContent.collectUpdateChanges();
        if (!changes) {
          return false;
        }

        isUpdatingPlanItem = true;
        void this
          .updateRecurringEventFromDialog(planItem.id, changes, dialogContent, dialogRef)
          .finally(() => {
            isUpdatingPlanItem = false;
          });
        return false;
      },
    });
  }

  private onDeleteRecurringEvent(row: object): void {
    const recurringEvent = row as RecurringEventTableRow;

    this.alertDialogService.create<DeleteRecurringEventAlertContentComponent>({
      zTitle: this.translateService.instant('recurringEvents.deleteAlert.title'),
      zDescription: this.translateService.instant('recurringEvents.deleteAlert.description', {
        title: recurringEvent.title,
      }),
      zContent: DeleteRecurringEventAlertContentComponent,
      zOkText: this.translateService.instant('recurringEvents.deleteAlert.actions.delete'),
      zCancelText: this.translateService.instant('recurringEvents.deleteAlert.actions.cancel'),
      zOkDestructive: true,
      zMaskClosable: true,
      zClosable: true,
      zOnOk: (dialogContent) => {
        void this.deleteRecurringEvent(recurringEvent.id, dialogContent?.shouldDeleteLinkedItems() ?? false);
      },
    });
  }

  private openAddRecurringEventDialog(): void {
    let isCreatingPlanItem = false;

    const dialogRef = this.dialogService.create<UpsertPlanItemDialogComponent, UpsertPlanItemDialogData>({
      zTitle: this.translateService.instant('recurringEvents.dialog.add.title'),
      zDescription: this.translateService.instant('recurringEvents.dialog.add.description'),
      zContent: UpsertPlanItemDialogComponent,
      zData: {
        accountOptions: this.accountOptions(),
        categoryOptions: this.categoryOptions(),
      },
      zWidth: 'min(calc(100dvw - 120px), 1040px)',
      zCustomClasses: 'max-h-[calc(100dvh-120px)] max-w-[calc(100dvw-120px)] sm:max-w-[calc(100dvw-120px)]',
      zMaskClosable: true,
      zOkText: this.translateService.instant('recurringEvents.dialog.add.actions.create'),
      zCancelText: this.translateService.instant('recurringEvents.dialog.add.actions.cancel'),
      zOkIcon: 'plus',
      zOnOk: (dialogContent) => {
        if (isCreatingPlanItem) {
          return false;
        }

        const payload = dialogContent.collectCreatePayload();
        if (!payload) {
          return false;
        }

        isCreatingPlanItem = true;
        void this
          .createRecurringEvent(
            {
              ...payload,
              create_and_run: 1,
            },
            dialogContent,
            dialogRef,
          )
          .finally(() => {
            isCreatingPlanItem = false;
          });
        return false;
      },
    });
  }

  private toDialogInitialValue(planItem: PlanItemModel): PlanItemDialogInitialValue {
    const commonValue: Omit<PlanItemDialogInitialValue, 'accountId' | 'categoryId' | 'fromAccountId' | 'toAccountId'> = {
      title: planItem.title,
      type: planItem.type,
      startDate: planItem.ruleJson.start_date,
      count: planItem.ruleJson.count,
      frequencyUnit: planItem.ruleJson.frequency.unit,
      frequencyInterval: planItem.ruleJson.frequency.interval,
      monthPolicy: (planItem.ruleJson.month_policy ?? null) as PlanItemMonthPolicy | null,
      settled: planItem.templateJson.settled !== undefined ? toBooleanFlag(planItem.templateJson.settled) : false,
      amount: centsToAmount(planItem.templateJson.amount_cents),
      description: planItem.templateJson.description,
    };

    if (planItem.type === 'transaction' && 'account_id' in planItem.templateJson && 'category_id' in planItem.templateJson) {
      return {
        ...commonValue,
        accountId: planItem.templateJson.account_id,
        categoryId: planItem.templateJson.category_id,
      };
    }

    if ('from_account_id' in planItem.templateJson && 'to_account_id' in planItem.templateJson) {
      return {
        ...commonValue,
        fromAccountId: planItem.templateJson.from_account_id,
        toAccountId: planItem.templateJson.to_account_id,
      };
    }

    return commonValue;
  }

  private async createRecurringEvent(
    payload: PlanItemCreateDto,
    dialogContent: UpsertPlanItemDialogComponent,
    dialogRef: ZardDialogRef<UpsertPlanItemDialogComponent>,
  ): Promise<void> {
    try {
      const created = await this.planItemsService.create(payload);
      if (!created) {
        dialogContent.setSubmitError('recurringEvents.dialog.add.errors.createFailed');
        toast.error(this.translateService.instant('recurringEvents.toasts.createError'));
        return;
      }

      const createdRow = isPlanItemCreateAndRunResult(created) ? created.row : created;
      const targetPage = getTargetPageAfterCreate(this.total(), this.pageSize());
      this.page.set(targetPage);
      await this.loadRecurringEvents(targetPage);
      dialogRef.close(createdRow);
      toast.success(this.translateService.instant('recurringEvents.toasts.createSuccess'));

      if (isPlanItemCreateAndRunResult(created)) {
        this.openRunResultAlert(created.run, 'recurringEvents.createResult.title');
      }
    } catch (error) {
      console.error('[recurring-events-page] Failed to create recurring event:', error);
      dialogContent.setSubmitError('recurringEvents.dialog.add.errors.createFailed');
      toast.error(this.translateService.instant('recurringEvents.toasts.createError'));
    }
  }

  private async updateRecurringEventFromDialog(
    id: number,
    changes: NonNullable<ReturnType<UpsertPlanItemDialogComponent['collectUpdateChanges']>>,
    dialogContent: UpsertPlanItemDialogComponent,
    dialogRef: ZardDialogRef<UpsertPlanItemDialogComponent>,
  ): Promise<void> {
    try {
      const result = await this.planItemsService.update({ id, changes });

      if (result.row) {
        const nextRows = this.rows().map((row) =>
          row.id === id ? this.toRecurringEventTableRow(result.row!) : row,
        );
        const nextPlanItems = new Map(this.planItemById());
        nextPlanItems.set(id, result.row);

        this.rows.set(nextRows);
        this.planItemById.set(nextPlanItems);
        dialogRef.close(result.row);
        this.openUpdateResultAlert(result.row.title);
        toast.success(this.translateService.instant('recurringEvents.toasts.updateSuccess'));
        return;
      }

      if (result.changed > 0) {
        await this.loadRecurringEvents();
        dialogRef.close(null);
        this.openUpdateResultAlert();
        toast.success(this.translateService.instant('recurringEvents.toasts.updateSuccess'));
        return;
      }

      dialogContent.setSubmitError('recurringEvents.dialog.edit.errors.updateFailed');
      toast.error(this.translateService.instant('recurringEvents.toasts.updateError'));
    } catch (error) {
      console.error('[recurring-events-page] Failed to update recurring event:', error);
      dialogContent.setSubmitError('recurringEvents.dialog.edit.errors.updateFailed');
      toast.error(this.translateService.instant('recurringEvents.toasts.updateError'));
    }
  }

  private async deleteRecurringEvent(id: number, deletePlannedItems = false): Promise<void> {
    try {
      const result = await this.planItemsService.remove({
        id,
        ...(deletePlannedItems ? { delete_planned_items: 1 } : {}),
      });

      if (result.changed > 0) {
        const targetPage = getTargetPageAfterDelete(this.total(), this.page(), this.pageSize());
        this.page.set(targetPage);
        await this.loadRecurringEvents(targetPage);
        toast.success(this.translateService.instant('recurringEvents.toasts.deleteSuccess'));
        return;
      }

      await this.loadRecurringEvents();
      toast.error(this.translateService.instant('recurringEvents.toasts.deleteError'));
    } catch (error) {
      console.error('[recurring-events-page] Failed to delete recurring event:', error);
      toast.error(this.translateService.instant('recurringEvents.toasts.deleteError'));
      await this.loadRecurringEvents();
    }
  }

  private openRunResultAlert(result: PlanItemRunResult, titleKey = 'recurringEvents.runResult.title'): void {
    const data: RecurringEventRunResultAlertData = {
      title: result.planItem.title,
      totalOccurrences: result.summary.totalOccurrences,
      created: result.summary.created,
      skippedExisting: result.summary.skippedExisting,
    };

    this.alertDialogService.info<RecurringEventRunResultAlertContentComponent>({
      zTitle: this.translateService.instant(titleKey),
      zContent: RecurringEventRunResultAlertContentComponent,
      zData: data,
      zWidth: 'min(calc(100dvw - 120px), 640px)',
      zOkText: this.translateService.instant('recurringEvents.runResult.actions.ok'),
      zMaskClosable: true,
      zClosable: true,
    });
  }

  private openUpdateResultAlert(title?: string): void {
    this.alertDialogService.info({
      zTitle: this.translateService.instant('recurringEvents.updateResult.title'),
      zDescription: this.translateService.instant('recurringEvents.updateResult.description', {
        ...(title ? { title } : { title: this.translateService.instant('nav.items.recurringEvents') }),
      }),
      zOkText: this.translateService.instant('recurringEvents.updateResult.actions.ok'),
      zMaskClosable: true,
      zClosable: true,
    });
  }
}
