import { TestBed } from '@angular/core/testing';

import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { AnalyticsService } from '@/services/analytics.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { OverviewMonthlyTotalsCardComponent } from './overview-monthly-totals-card.component';

// The card rebuilds its chart labels when the app language changes, and must stop doing so once it is
// destroyed. The same subscription pattern is used by the other charts and pages that follow the language.

describe('OverviewMonthlyTotalsCardComponent language changes', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
        {
          provide: AnalyticsService,
          useValue: { expensesIncomesNetCashflowByMonth: async () => ({ rows: [] }) },
        },
        { provide: LocalPreferencesService, useValue: { currencyPreference: () => 'EUR' } },
      ],
    });
    // The chart and card templates are not under test, only the component class.
    TestBed.overrideComponent(OverviewMonthlyTotalsCardComponent, {
      set: { imports: [], template: '' },
    });

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {});
    translate.setTranslation('it', {});
    translate.use('en');
    const instant = vi.spyOn(translate, 'instant');

    const fixture = TestBed.createComponent(OverviewMonthlyTotalsCardComponent);
    fixture.detectChanges();
    return { fixture, translate, instant };
  }

  it('rebuilds its localized series when the language changes', async () => {
    const { fixture, translate, instant } = setup();
    await fixture.whenStable();
    // Turn the one-off empty-series call at start-up and the first load into history.
    instant.mockClear();
    // Rows are empty in this test, so the rebuild uses the empty-series path.
    translate.use('it');

    expect(instant).toHaveBeenCalledWith('overview.cards.monthlyTotals.series.incomes', undefined);
  });

  it('stops reacting to language changes once destroyed', async () => {
    const { fixture, translate, instant } = setup();
    await fixture.whenStable();

    fixture.destroy();
    instant.mockClear();
    translate.use('it');

    expect(instant).not.toHaveBeenCalled();
  });
});
