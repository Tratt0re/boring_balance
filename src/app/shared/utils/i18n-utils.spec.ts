import { TestBed } from '@angular/core/testing';

import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { pluralKey, translatePlural } from './i18n-utils';

// The wording of a count-dependent message comes from <key>_one / _few / _many / _other, chosen by the
// language's own plural rules, so "1 day" and "5 days" (and Ukrainian's "2 дні") all read correctly.

describe('translatePlural', () => {
  function setup(language: string, translations: Record<string, string>) {
    TestBed.configureTestingModule({
      providers: [provideTranslateService({ lang: language, fallbackLang: 'en' })],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation(language, translations);
    translate.use(language);
    return translate;
  }

  it('picks the singular and plural form in English', () => {
    const translate = setup('en', {
      days_one: '{{count}} day ago',
      days_other: '{{count}} days ago',
    });
    expect(translatePlural(translate, 'days', 1)).toBe('1 day ago');
    expect(translatePlural(translate, 'days', 0)).toBe('0 days ago');
    expect(translatePlural(translate, 'days', 5)).toBe('5 days ago');
  });

  it('uses the extra forms Ukrainian needs', () => {
    const translate = setup('uk', {
      days_one: '{{count}} день',
      days_few: '{{count}} дні',
      days_many: '{{count}} днів',
      days_other: '{{count}} дня',
    });
    expect(translatePlural(translate, 'days', 1)).toBe('1 день');
    expect(translatePlural(translate, 'days', 2)).toBe('2 дні');
    expect(translatePlural(translate, 'days', 5)).toBe('5 днів');
    expect(translatePlural(translate, 'days', 21)).toBe('21 день');
  });

  it('uses the single form of a language without plurals', () => {
    const translate = setup('zh', { days_other: '{{count}} 天前' });
    expect(translatePlural(translate, 'days', 1)).toBe('1 天前');
    expect(translatePlural(translate, 'days', 9)).toBe('9 天前');
  });

  it('falls back to the _other form when the language has no key for the category', () => {
    const translate = setup('en', { days_other: '{{count}} days ago' });
    expect(translatePlural(translate, 'days', 1)).toBe('1 days ago');
  });

  it('passes extra params to the message', () => {
    const translate = setup('en', {
      repeats_one: 'Repeats every {{unit}}, {{count}} time',
      repeats_other: 'Repeats every {{unit}}, {{count}} times',
    });
    expect(translatePlural(translate, 'repeats', 12, { unit: 'month' })).toBe(
      'Repeats every month, 12 times',
    );
  });

  it('returns the key a template can translate with {{count}}', () => {
    const translate = setup('uk', {
      days_one: 'one',
      days_few: 'few',
      days_many: 'many',
      days_other: 'other',
    });
    expect(pluralKey(translate, 'days', 3)).toBe('days_few');
    expect(pluralKey(translate, 'days', 11)).toBe('days_many');
  });
});
