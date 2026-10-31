import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { AccountsService } from '@/services/accounts.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { TransactionsService } from '@/services/transactions.service';
import { OverviewGettingStartedCardComponent } from './overview-getting-started-card.component';

// A new user sees two steps (add an account, add a first transaction). The card disappears once both
// are done or the user hides it, and it stays out of the way if the counts cannot be read.

describe('OverviewGettingStartedCardComponent', () => {
  function setup(options: { accounts?: number; transactions?: number; fail?: boolean }) {
    const navigate = vi.fn(async () => true);
    const list = vi.fn(async () => {
      if (options.fail) throw new Error('no ipc');
      return { total: options.accounts ?? 0 };
    });
    const listTransactions = vi.fn(async () => ({ total: options.transactions ?? 0 }));
    const dismissed = signal(false);

    TestBed.configureTestingModule({
      providers: [
        provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
        { provide: Router, useValue: { navigate } },
        { provide: AccountsService, useValue: { list } },
        { provide: TransactionsService, useValue: { listTransactions } },
        {
          provide: LocalPreferencesService,
          useValue: {
            gettingStartedDismissedPreference: dismissed.asReadonly(),
            setGettingStartedDismissed: (value: boolean) => dismissed.set(value),
          },
        },
      ],
    });
    TestBed.inject(TranslateService).setTranslation('en', {
      overview: {
        gettingStarted: {
          title: 'Get started',
          dismiss: 'Hide checklist',
          done: 'Done',
          steps: {
            account: { title: 'Add an account', description: 'd', action: 'Add account' },
            transaction: {
              title: 'Add a transaction',
              description: 'd',
              action: 'Add transaction',
            },
          },
        },
      },
    });

    const fixture = TestBed.createComponent(OverviewGettingStartedCardComponent);
    return { fixture, navigate, list, dismissed, el: fixture.nativeElement as HTMLElement };
  }

  // The counts come from mocked promises that Angular does not track, so let them resolve first.
  async function settle(fixture: { detectChanges: () => void }) {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  it('shows both steps to a brand-new user, with the second step disabled', async () => {
    const { fixture, el } = setup({ accounts: 0, transactions: 0 });
    await settle(fixture);

    expect(el.textContent).toContain('Add an account');
    expect(el.textContent).toContain('Add a transaction');
    const buttons = [...el.querySelectorAll('ol button')] as HTMLButtonElement[];
    expect(buttons.map((b) => b.disabled)).toEqual([false, true]);
  });

  it('enables the second step once an account exists and marks the first one done', async () => {
    const { fixture, el } = setup({ accounts: 2, transactions: 0 });
    await settle(fixture);

    const buttons = [...el.querySelectorAll('ol button')] as HTMLButtonElement[];
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain('Add transaction');
    expect(buttons[0].disabled).toBe(false);
    expect(el.querySelector('li .sr-only')?.textContent).toContain('Done');
  });

  it('goes away by itself when both steps are done', async () => {
    const { fixture, el, list } = setup({ accounts: 1, transactions: 3 });
    await settle(fixture);

    expect(list).toHaveBeenCalled();
    expect(el.querySelector('ol')).toBeNull();
  });

  it('can be hidden for good', async () => {
    const { fixture, el, dismissed } = setup({ accounts: 0, transactions: 0 });
    await settle(fixture);

    (el.querySelector('[data-testid="getting-started-dismiss"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(dismissed()).toBe(true);
    expect(el.querySelector('ol')).toBeNull();
  });

  it('opens the add form on the page for the clicked step', async () => {
    const { fixture, el, navigate } = setup({ accounts: 0, transactions: 0 });
    await settle(fixture);

    (el.querySelector('ol li button') as HTMLButtonElement).click();

    expect(navigate).toHaveBeenCalledWith(['/accounts'], { queryParams: { add: 1 } });
  });

  it('stays out of the way when the counts cannot be read', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { fixture, el, list } = setup({ fail: true });
    await settle(fixture);

    expect(list).toHaveBeenCalled();
    expect(el.querySelector('ol')).toBeNull();
    consoleError.mockRestore();
  });
});
