import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Every locale file must expose exactly the keys of en.json, with the same `{{params}}` in each
// value, so a missing or renamed key cannot silently fall back to English in one language.

const I18N_DIR = join(process.cwd(), 'public', 'i18n');
const SOURCE_LOCALE = 'en';

type Messages = Record<string, string>;

function flatten(node: unknown, prefix = '', out: Messages = {}): Messages {
  if (typeof node === 'string') {
    out[prefix] = node;
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

function load(locale: string): Messages {
  return flatten(JSON.parse(readFileSync(join(I18N_DIR, `${locale}.json`), 'utf8')));
}

function params(message: string): string[] {
  return [...message.matchAll(/{{\s*([\w.]+)\s*}}/g)].map((match) => match[1]).sort();
}

const locales = readdirSync(I18N_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''));
const source = load(SOURCE_LOCALE);
const others = locales.filter((locale) => locale !== SOURCE_LOCALE);

describe('i18n locales', () => {
  it('ships the seven supported locales', () => {
    expect([...locales].sort()).toEqual(['de', 'en', 'es', 'fr', 'it', 'uk', 'zh']);
  });

  for (const locale of others) {
    it(`${locale} has exactly the keys of en.json`, () => {
      const keys = Object.keys(load(locale));
      const sourceKeys = Object.keys(source);
      expect(sourceKeys.filter((key) => !keys.includes(key))).toEqual([]);
      expect(keys.filter((key) => !sourceKeys.includes(key))).toEqual([]);
    });

    it(`${locale} uses the same {{params}} as en.json for every key`, () => {
      const messages = load(locale);
      const mismatched = Object.keys(source).filter(
        (key) => key in messages && params(messages[key]).join() !== params(source[key]).join(),
      );
      expect(mismatched).toEqual([]);
    });
  }

  for (const locale of locales) {
    it(`${locale} has an _other form for every _one plural key`, () => {
      const keys = Object.keys(load(locale));
      const orphans = keys
        .filter((key) => key.endsWith('_one'))
        .filter((key) => !keys.includes(key.replace(/_one$/, '_other')));
      expect(orphans).toEqual([]);
    });
  }
});
