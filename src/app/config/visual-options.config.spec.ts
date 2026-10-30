import { ZARD_ICONS } from '@/shared/components/icon/icons';

import {
  APP_COLOR_OPTIONS,
  APP_ICON_OPTIONS,
  normalizeColorKey,
  normalizeIconKey,
} from './visual-options.config';

describe('visual options', () => {
  it('offers 15 selectable system colors', () => {
    const keys = APP_COLOR_OPTIONS.map((option) => option.value).filter(Boolean);
    expect(keys.length).toBe(15);
    for (let n = 1; n <= 15; n++) {
      expect(normalizeColorKey(`system-app-color-${n}`)).toBe(`system-app-color-${n}`);
    }
  });

  it('has no duplicate color or icon values', () => {
    for (const options of [APP_COLOR_OPTIONS, APP_ICON_OPTIONS]) {
      const values = options.map((option) => option.value).filter(Boolean);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('registers every icon option so it renders', () => {
    for (const option of APP_ICON_OPTIONS) {
      if (!option.icon) continue;
      expect(Object.keys(ZARD_ICONS)).toContain(option.icon as string);
      expect(normalizeIconKey(option.value)).toBe(option.value);
    }
  });

  it('includes the expense-oriented icons', () => {
    for (const key of ['fuel', 'lightbulb', 'zap', 'droplets', 'flame', 'wifi']) {
      expect(normalizeIconKey(key)).toBe(key);
    }
  });
});
