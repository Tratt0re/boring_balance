import { TestBed } from '@angular/core/testing';

import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { SettingsProblemService } from '@/services/settings-problem.service';
import { ZardAlertDialogService } from '@/shared/components/alert-dialog';
import { DataSectionComponent } from './data-section.component';

// When settings.json was found damaged, the Data & Storage section tells the user and lets them
// dismiss the notice. Without a problem the section shows nothing extra.

describe('DataSectionComponent settings problem notice', () => {
  function setup(problem: unknown, failLoading = false) {
    const service = {
      getProblem: vi.fn(async () => {
        if (failLoading) throw new Error('no ipc');
        return problem;
      }),
      acknowledgeProblem: vi.fn(async () => {}),
    };
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
        { provide: SettingsProblemService, useValue: service },
        { provide: ZardAlertDialogService, useValue: { create: vi.fn() } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      settings: { data: { settings_problem: { kept_as: 'Kept as {{file}}', not_moved: 'Not moved' } } },
    });
    translate.use('en');
    const fixture = TestBed.createComponent(DataSectionComponent);
    return { fixture, service, el: fixture.nativeElement as HTMLElement };
  }

  async function render(fixture: ReturnType<typeof setup>['fixture']) {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows no notice when settings are healthy', async () => {
    const { fixture, el } = setup(null);
    await render(fixture);

    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows no notice, and does not fail, when the problem cannot be loaded', async () => {
    const { fixture, el } = setup(null, true);
    await render(fixture);

    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the kept file name and hides the notice and acknowledges when dismissed', async () => {
    const { fixture, service, el } = setup({
      at: 1,
      keptFileName: 'settings.json.corrupt-1',
      reason: 'x',
    });
    await render(fixture);

    const alert = el.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('settings.json.corrupt-1');

    (alert!.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.acknowledgeProblem).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('says the file could not be moved when no copy name exists', async () => {
    const { fixture, el } = setup({ at: 1, keptFileName: null, reason: 'x' });
    await render(fixture);

    const text = el.querySelector('[role="alert"]')!.textContent ?? '';
    expect(text).not.toContain('Kept as');
    expect(text).toContain('Not moved');
  });
});
