import { ChangeDetectionStrategy, Component, OnInit, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';

import { AppBaseCardComponent } from '@/components/base-card';
import {
  APP_COLOR_OPTIONS,
  APP_ICON_OPTIONS,
  DEFAULT_VISUAL_COLOR_KEY,
  DEFAULT_VISUAL_ICON_KEY,
} from '@/config/visual-options.config';
import { AccountsService } from '@/services/accounts.service';
import { CategoriesService } from '@/services/categories.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { TransactionsService } from '@/services/transactions.service';
import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { type ZardIcon, ZardIconComponent } from '@/shared/components/icon';
import { ZardLoaderComponent } from '@/shared/components/loader';
import { ZardSwitchComponent } from '@/shared/components/switch';
import { ZardTooltipImports } from '@/shared/components/tooltip';

const APP_ICON_BY_VALUE = new Map(APP_ICON_OPTIONS.map((option) => [option.value, option.icon ?? null] as const));
const APP_COLOR_HEX_BY_VALUE = new Map(APP_COLOR_OPTIONS.map((option) => [option.value, option.colorHex ?? null] as const));
const DEFAULT_CATEGORY_ICON = (APP_ICON_BY_VALUE.get(DEFAULT_VISUAL_ICON_KEY) ?? 'tag') as ZardIcon;
const DEFAULT_CATEGORY_COLOR_HEX = APP_COLOR_HEX_BY_VALUE.get(DEFAULT_VISUAL_COLOR_KEY) ?? `var(--${DEFAULT_VISUAL_COLOR_KEY})`;

function toCurrentMonthRangeTimestamps(referenceDate: Date = new Date()): { from: number; to: number } {
  const year = referenceDate.getFullYear();
  const monthIndex = referenceDate.getMonth();
  const from = new Date(year, monthIndex, 1, 0, 0, 0, 0).getTime();
  const to = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999).getTime();
  return { from, to };
}

interface TransactionListCardRow {
  readonly id: number;
  readonly occurredAt: number;
  readonly amount: number;
  readonly settled: boolean;
  readonly accountName: string;
  readonly accountIcon: ZardIcon;
  readonly accountColorHex: string;
  readonly categoryName: string;
  readonly categoryIcon: ZardIcon;
  readonly categoryColorHex: string;
  readonly categoryType: 'income' | 'expense' | 'exclude';
}

@Component({
  selector: 'app-transaction-list-card',
  imports: [
    AppBaseCardComponent,
    RouterLink,
    TranslatePipe,
    ZardButtonComponent,
    ZardBadgeComponent,
    ZardIconComponent,
    ZardLoaderComponent,
    ZardSwitchComponent,
    ...ZardTooltipImports,
  ],
  templateUrl: './transaction-list-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class AppTransactionListCardComponent implements OnInit {
  readonly zTitleKey = input('overview.cards.recentTransactions.title');
  readonly limit = input(5);
  readonly height = input<string | null>(null);

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly rows = signal<readonly TransactionListCardRow[]>([]);
  protected readonly pendingSettledIds = signal<ReadonlySet<number>>(new Set<number>());

  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly localPreferencesService: LocalPreferencesService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    void this.loadTransactions();
  }

  async reload(): Promise<void> {
    await this.loadTransactions();
  }

  protected isSettledUpdatePending(id: number): boolean {
    return this.pendingSettledIds().has(id);
  }

  protected amountTrendIcon(amount: number): 'arrow-up' | 'arrow-down' | null {
    if (!Number.isFinite(amount) || amount === 0) {
      return null;
    }

    return amount > 0 ? 'arrow-up' : 'arrow-down';
  }

  protected amountTrendIconColor(amount: number): string | null {
    if (!Number.isFinite(amount) || amount === 0) {
      return null;
    }

    return amount > 0 ? 'var(--positive-transaction-color)' : 'var(--negative-transaction-color)';
  }

  protected settledStatusTooltip(settled: boolean): string {
    return this.translate(
      settled
        ? 'overview.cards.recentTransactions.tooltips.settled'
        : 'overview.cards.recentTransactions.tooltips.unsettled',
    );
  }

  protected async onSettledChange(rowId: number, nextSettled: boolean): Promise<void> {
    const currentRow = this.rows().find((row) => row.id === rowId);
    if (!currentRow || this.isSettledUpdatePending(rowId)) {
      return;
    }

    const previousSettled = currentRow.settled;
    this.setPendingSettled(rowId, true);
    this.rows.update((rows) => rows.map((row) => (row.id === rowId ? { ...row, settled: nextSettled } : row)));

    try {
      const result = await this.transactionsService.update({
        id: rowId,
        changes: { settled: nextSettled },
      });

      if (result.row) {
        this.rows.update((rows) =>
          rows.map((row) => (row.id === rowId ? { ...row, settled: result.row?.settled ?? nextSettled } : row)),
        );
      }
    } catch (error) {
      console.error('[transaction-list-card] Failed to update settled state:', error);
      this.rows.update((rows) => rows.map((row) => (row.id === rowId ? { ...row, settled: previousSettled } : row)));
    } finally {
      this.setPendingSettled(rowId, false);
    }
  }

  protected formatTransactionDate(timestampMs: number): string {
    const date = new Date(timestampMs);
    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();

    return new Intl.DateTimeFormat(this.resolveLocale(), {
      day: '2-digit',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
    }).format(date);
  }

  protected formatAmount(amount: number): string {
    const currency = this.localPreferencesService.getCurrency().toUpperCase();

    try {
      return new Intl.NumberFormat(this.resolveLocale(), {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  }

  protected settledToggleActionLabel(settled: boolean): string {
    return this.translate(
      settled
        ? 'overview.cards.recentTransactions.tooltips.unsettled'
        : 'overview.cards.recentTransactions.tooltips.settle',
    );
  }

  private async loadTransactions(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const safeLimit = this.normalizeLimit(this.limit());
      const { from, to } = toCurrentMonthRangeTimestamps();
      const [transactions, accounts, categories] = await Promise.all([
        this.transactionsService.listTransactions({
          page: 1,
          page_size: safeLimit,
          filters: {
            date_from: from,
            date_to: to,
          },
        }),
        this.accountsService.listAll(),
        this.categoriesService.listAll(),
      ]);

      const accountById = new Map(accounts.map((account) => [account.id, account] as const));
      const categoryById = new Map(categories.map((category) => [category.id, category] as const));

      this.rows.set(
        transactions.rows.map((transaction) => {
          const account = accountById.get(transaction.accountId);
          const category = categoryById.get(transaction.categoryId);

          return {
            id: transaction.id,
            occurredAt: transaction.occurredAt,
            amount: transaction.amount,
            settled: transaction.settled,
            accountName: account?.name ?? this.translate('overview.cards.recentTransactions.unknownAccount'),
            accountIcon: this.resolveVisualIcon(account?.icon),
            accountColorHex: this.resolveVisualColorHex(account?.colorKey),
            categoryName: category?.name ?? this.translate('overview.cards.recentTransactions.unknownCategory'),
            categoryIcon: this.resolveVisualIcon(category?.icon),
            categoryColorHex: this.resolveVisualColorHex(category?.colorKey),
            categoryType: category?.type ?? 'exclude',
          };
        }),
      );
    } catch (error) {
      console.error('[transaction-list-card] Failed to load recent transactions:', error);
      this.rows.set([]);
      this.loadError.set(error instanceof Error ? error.message : 'Unexpected error while loading transactions.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private normalizeLimit(value: number): number {
    return Number.isInteger(value) && value > 0 ? value : 5;
  }

  private setPendingSettled(id: number, isPending: boolean): void {
    this.pendingSettledIds.update((currentSet) => {
      const nextSet = new Set(currentSet);
      if (isPending) {
        nextSet.add(id);
      } else {
        nextSet.delete(id);
      }

      return nextSet;
    });
  }

  private translate(key: string, params?: Record<string, unknown>): string {
    const translated = this.translateService.instant(key, params);
    return typeof translated === 'string' ? translated : key;
  }

  private resolveVisualIcon(iconValue: string | null | undefined): ZardIcon {
    if (typeof iconValue !== 'string' || iconValue.trim().length === 0) {
      return DEFAULT_CATEGORY_ICON;
    }

    return (APP_ICON_BY_VALUE.get(iconValue) ?? DEFAULT_CATEGORY_ICON) as ZardIcon;
  }

  private resolveVisualColorHex(colorKey: string | null | undefined): string {
    if (typeof colorKey !== 'string' || colorKey.trim().length === 0) {
      return DEFAULT_CATEGORY_COLOR_HEX;
    }

    return APP_COLOR_HEX_BY_VALUE.get(colorKey) ?? `var(--${colorKey})`;
  }

  private resolveLocale(): string {
    const currentLanguage = this.translateService.currentLang?.trim();
    return currentLanguage && currentLanguage.length > 0 ? currentLanguage : 'en';
  }
}
