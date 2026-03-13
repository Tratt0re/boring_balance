import {
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'theme';
const THEME_ORDER: readonly ThemeMode[] = ['light', 'dark', 'system'];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly mediaQuery =
    typeof window?.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  readonly theme = signal<ThemeMode>(this.readTheme());

  readonly resolvedTheme = computed<'light' | 'dark'>(() => {
    const t = this.theme();
    if (t === 'system') {
      return this.mediaQuery?.matches ? 'dark' : 'light';
    }
    return t;
  });

  constructor() {
    const syncSystemTheme = () => {
      if (this.theme() === 'system') {
        this.applyTheme(this.theme());
      }
    };

    if (this.mediaQuery) {
      this.mediaQuery.addEventListener('change', syncSystemTheme);
      this.destroyRef.onDestroy(() =>
        this.mediaQuery!.removeEventListener('change', syncSystemTheme),
      );
    }

    effect(() => {
      this.applyTheme(this.theme());
    });
  }

  cycleTheme(event?: MouseEvent): void {
    const currentIndex = THEME_ORDER.indexOf(this.theme());
    const next = THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length];
    this.setTheme(next, event);
  }

  setTheme(mode: ThemeMode, event?: MouseEvent): void {
    if (event && typeof document !== 'undefined') {
      const html = document.documentElement;
      html.style.setProperty('--theme-toggle-x', `${event.clientX}px`);
      html.style.setProperty('--theme-toggle-y', `${event.clientY}px`);
    }
    this.theme.set(mode);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // ignore storage failures
    }
  }

  private readTheme(): ThemeMode {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    } catch {
      // ignore
    }
    // Resolve system preference to a concrete value
    return this.mediaQuery?.matches ? 'dark' : 'light';
  }

  private applyTheme(mode: ThemeMode): void {
    const isDark =
      mode === 'dark' || (mode === 'system' && (this.mediaQuery?.matches ?? false));

    const apply = () => {
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.setAttribute('data-theme', mode);
    };

    if (typeof document === 'undefined') return;

    const html = document.documentElement;
    if ('startViewTransition' in document) {
      html.classList.add('theme-transition');
      (document as Document & { startViewTransition: (cb: () => void) => { finished: Promise<void> } })
        .startViewTransition(apply)
        .finished.finally(() => html.classList.remove('theme-transition'));
    } else {
      html.classList.add('theme-transition');
      apply();
      setTimeout(() => html.classList.remove('theme-transition'), 300);
    }
  }
}
