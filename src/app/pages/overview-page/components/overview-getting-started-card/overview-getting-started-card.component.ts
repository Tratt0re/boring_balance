import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AppBaseCardComponent } from '@/components/base-card';
import { AccountsService } from '@/services/accounts.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { TransactionsService } from '@/services/transactions.service';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardIconComponent } from '@/shared/components/icon';
import { ZardTooltipImports } from '@/shared/components/tooltip';

// A short checklist for a new user: add an account, then record a first transaction. It goes away
// by itself once both are done, or for good when the user hides it.

@Component({
  selector: 'app-overview-getting-started-card',
  imports: [
    AppBaseCardComponent,
    TranslatePipe,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardTooltipImports,
  ],
  templateUrl: './overview-getting-started-card.component.html',
  // A block so the page's vertical spacing applies to it, and collapsed while the card is hidden.
  host: { class: 'block empty:hidden' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewGettingStartedCardComponent implements OnInit {
  private readonly accountsService = inject(AccountsService);
  private readonly transactionsService = inject(TransactionsService);
  private readonly localPreferencesService = inject(LocalPreferencesService);
  private readonly router = inject(Router);

  private readonly loaded = signal(false);
  protected readonly hasAccount = signal(false);
  protected readonly hasTransaction = signal(false);

  protected readonly visible = computed(
    () =>
      this.loaded() &&
      !this.localPreferencesService.gettingStartedDismissedPreference() &&
      !(this.hasAccount() && this.hasTransaction()),
  );

  ngOnInit(): void {
    void this.reload();
  }

  /** Re-reads what the user has done so far; called when the Overview data changes. */
  async reload(): Promise<void> {
    try {
      const [accounts, transactions] = await Promise.all([
        this.accountsService.list({ page: 1, page_size: 1 }),
        this.transactionsService.listTransactions({ page: 1, page_size: 1 }),
      ]);
      this.hasAccount.set(accounts.total > 0);
      this.hasTransaction.set(transactions.total > 0);
    } catch (error) {
      // The checklist is a convenience: if the counts cannot be read it stays out of the way.
      console.error('[getting-started] Failed to read account and transaction counts:', error);
      this.hasAccount.set(true);
      this.hasTransaction.set(true);
    } finally {
      this.loaded.set(true);
    }
  }

  protected onAddAccount(): void {
    void this.router.navigate(['/accounts'], { queryParams: { add: 1 } });
  }

  protected onAddTransaction(): void {
    void this.router.navigate(['/transactions'], { queryParams: { add: 1 } });
  }

  protected onDismiss(): void {
    this.localPreferencesService.setGettingStartedDismissed(true);
  }
}
