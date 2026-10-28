import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// The renderer loads from file:// (or the dev server) with a CSP meta tag as its only network and
// script policy. These tests pin the policy's shape and the extracted theme script, so a change that
// quietly weakens either one is caught.

const root = path.resolve(import.meta.dirname, '../..');
const indexHtml = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const themeInitSource = fs.readFileSync(path.join(root, 'public/theme-init.js'), 'utf8');

function readPolicy() {
  const tag = indexHtml.match(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>/i)?.[0];
  const content = tag?.match(/content="([^"]*)"/i)?.[1];
  if (!content) {
    return null;
  }

  return Object.fromEntries(
    content
      .split(';')
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...sources] = directive.split(/\s+/);
        return [name, sources];
      }),
  );
}

describe('content security policy in index.html', () => {
  const policy = readPolicy();

  it('exists as a meta tag in the head, before any script or stylesheet', () => {
    expect(policy).not.toBeNull();
    const metaIndex = indexHtml.search(/http-equiv="Content-Security-Policy"/i);
    expect(metaIndex).toBeGreaterThan(-1);
    expect(metaIndex).toBeLessThan(indexHtml.search(/<script/i));
  });

  it('denies everything by default', () => {
    expect(policy['default-src']).toEqual(["'none'"]);
  });

  it('only runs scripts served by the app itself', () => {
    expect(policy['script-src']).toEqual(["'self'"]);
  });

  it('never allows unsafe-eval or unsafe-inline for scripts, anywhere', () => {
    for (const directive of ['script-src', 'script-src-elem', 'script-src-attr', 'default-src']) {
      expect(policy[directive] ?? []).not.toContain("'unsafe-eval'");
      expect(policy[directive] ?? []).not.toContain("'unsafe-inline'");
      expect(policy[directive] ?? []).not.toContain("'unsafe-hashes'");
    }
    expect(JSON.stringify(policy)).not.toContain('wasm-unsafe-eval');
  });

  it('loads styles from the app, plus inline styles that Angular adds for component styles', () => {
    expect(policy['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it('restricts images, fonts and requests to the app itself', () => {
    expect(policy['img-src']).toEqual(["'self'", 'data:']);
    expect(policy['font-src']).toEqual(["'self'"]);
    expect(policy['connect-src']).toEqual(["'self'"]);
  });

  it('allows no plugins, frames, workers, forms or foreign base URLs', () => {
    expect(policy['object-src']).toEqual(["'none'"]);
    expect(policy['frame-src']).toEqual(["'none'"]);
    expect(policy['base-uri']).toEqual(["'self'"]);
    expect(policy['form-action']).toEqual(["'none'"]);
    expect(policy['worker-src']).toBeUndefined(); // falls back to default-src 'none'
  });

  it('never opens a directive to the whole internet', () => {
    const sources = Object.values(policy).flat();
    expect(sources).not.toContain('*');
    expect(sources).not.toContain('http:');
    expect(sources).not.toContain('https:');
    expect(sources.filter((source) => /^https?:\/\//.test(source))).toEqual([]);
  });

  it('keeps index.html free of inline scripts and event-handler attributes', () => {
    const inlineScripts = [...indexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/gi)];
    expect(inlineScripts).toEqual([]);
    expect(indexHtml).not.toMatch(/\son[a-z]+\s*=/i);
    expect(indexHtml).not.toMatch(/javascript:/i);
  });

  it('loads the theme script from a file instead', () => {
    expect(indexHtml).toMatch(/<script[^>]+src="theme-init\.js"/);
  });
});

describe('production build settings that the policy depends on', () => {
  const angularJson = JSON.parse(fs.readFileSync(path.join(root, 'angular.json'), 'utf8'));
  const production = Object.values(angularJson.projects)[0].architect.build.configurations
    .production;

  it('does not inline critical CSS, which adds an onload handler the policy would block', () => {
    expect(production.optimization?.styles?.inlineCritical).toBe(false);
  });

  it('still minifies scripts and styles', () => {
    expect(production.optimization?.scripts).toBe(true);
    expect(production.optimization?.styles?.minify).toBe(true);
  });
});

describe('public/theme-init.js', () => {
  function runThemeInit({
    theme,
    prefersDark = false,
    throwOnStorage = false,
    noMatchMedia = false,
  }) {
    const classToggles = [];
    const attributes = {};
    const storage = throwOnStorage ? null : theme === undefined ? {} : { theme };
    const context = {
      document: {
        documentElement: {
          classList: { toggle: (name, force) => classToggles.push([name, force]) },
          setAttribute: (name, value) => {
            attributes[name] = value;
          },
        },
      },
      window: noMatchMedia ? {} : { matchMedia: () => ({ matches: prefersDark }) },
    };
    Object.defineProperty(context, 'localStorage', {
      get() {
        if (throwOnStorage) {
          throw new Error('storage blocked');
        }
        return storage;
      },
    });

    vm.runInNewContext(themeInitSource, context);
    return { classToggles, attributes };
  }

  it.each([
    ['dark', false, [['dark', true]], 'dark'],
    ['dark', true, [['dark', true]], 'dark'],
    ['light', true, [['dark', false]], 'light'],
    ['light', false, [['dark', false]], 'light'],
    ['system', true, [['dark', true]], 'system'],
    ['system', false, [['dark', false]], 'system'],
    [undefined, true, [['dark', true]], 'system'],
    [undefined, false, [['dark', false]], 'system'],
  ])('theme %s with a dark OS preference of %s', (theme, prefersDark, toggles, dataTheme) => {
    const { classToggles, attributes } = runThemeInit({ theme, prefersDark });

    expect(classToggles).toEqual(toggles);
    expect(attributes['data-theme']).toBe(dataTheme);
  });

  it('treats a missing matchMedia as a light preference', () => {
    const { classToggles } = runThemeInit({ theme: 'system', noMatchMedia: true });
    expect(classToggles).toEqual([['dark', false]]);
  });

  it('does nothing, and does not throw, when storage is unavailable', () => {
    expect(() => runThemeInit({ throwOnStorage: true })).not.toThrow();
    const { classToggles, attributes } = runThemeInit({ throwOnStorage: true });
    expect(classToggles).toEqual([]);
    expect(attributes).toEqual({});
  });

  it('does not leak variables into the page', () => {
    const context = {
      document: { documentElement: { classList: { toggle() {} }, setAttribute() {} } },
      window: { matchMedia: () => ({ matches: false }) },
      localStorage: {},
    };
    vm.runInNewContext(themeInitSource, context);
    expect(Object.keys(context).sort()).toEqual(['document', 'localStorage', 'window']);
  });
});
