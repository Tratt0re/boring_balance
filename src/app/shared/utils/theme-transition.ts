import type { DarkModeOptions, ZardDarkMode } from '@/shared/services/dark-mode';

type ThemeViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void | Promise<void>) => {
    ready: Promise<void>;
  };
};

interface ApplyThemeTransitionOptions {
  readonly targetMode?: DarkModeOptions;
  readonly origin?: MouseEvent | HTMLElement | null;
}

export function applyThemeTransition(
  darkMode: ZardDarkMode,
  { targetMode, origin = null }: ApplyThemeTransitionOptions = {},
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const applyTheme = () => darkMode.toggleTheme(targetMode);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyTheme();
    return;
  }

  const triggerElement = origin instanceof MouseEvent
    ? (origin.currentTarget instanceof HTMLElement ? origin.currentTarget : null)
    : origin instanceof HTMLElement
      ? origin
      : null;
  const transitionDocument = document as ThemeViewTransitionDocument;
  const startViewTransition = transitionDocument.startViewTransition?.bind(transitionDocument);

  if (!startViewTransition) {
    const html = document.documentElement;
    html.classList.add('theme-transition');
    window.requestAnimationFrame(applyTheme);
    window.setTimeout(() => html.classList.remove('theme-transition'), 280);
    return;
  }

  const targetRect = triggerElement?.getBoundingClientRect();
  const x = targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth / 2;
  const y = targetRect ? targetRect.top + targetRect.height / 2 : window.innerHeight / 2;
  const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = startViewTransition(applyTheme);

  void transition.ready
    .then(() => {
      document.documentElement.animate(
        {
          clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
        },
        {
          duration: 560,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'both',
          pseudoElement: '::view-transition-new(root)',
        } as KeyframeAnimationOptions & { pseudoElement: string },
      );
    })
    .catch(() => {});
}
