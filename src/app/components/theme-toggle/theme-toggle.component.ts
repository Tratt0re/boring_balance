import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardIconComponent } from '@/shared/components/icon';
import { EDarkModes, ZardDarkMode } from '@/shared/services/dark-mode';

type ThemeViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void | Promise<void>) => {
    ready: Promise<void>;
  };
};

@Component({
  selector: 'app-theme-toggle',
  imports: [ZardButtonComponent, ZardIconComponent, TranslatePipe],
  templateUrl: './theme-toggle.component.html',
})
export class ThemeToggleComponent {
  protected readonly EDarkModes = EDarkModes;
  protected readonly darkMode = inject(ZardDarkMode);

  protected getThemeToggleAriaLabelKey(): string {
    return this.darkMode.themeMode() === EDarkModes.DARK ? 'header.theme.activateLight' : 'header.theme.activateDark';
  }

  protected getThemeToggleTitleKey(): string {
    return this.darkMode.themeMode() === EDarkModes.DARK ? 'header.theme.lightMode' : 'header.theme.darkMode';
  }

  protected toggleTheme(event: MouseEvent): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.darkMode.toggleTheme();
      return;
    }

    this.applyCircularThemeTransition(event);
  }

  private applyCircularThemeTransition(event: MouseEvent): void {
    const transitionDocument = document as ThemeViewTransitionDocument;
    const startViewTransition = transitionDocument.startViewTransition?.bind(transitionDocument);

    if (!startViewTransition) {
      this.applyFallbackThemeTransition();
      return;
    }

    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const targetRect = target?.getBoundingClientRect();
    const x = targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth / 2;
    const y = targetRect ? targetRect.top + targetRect.height / 2 : window.innerHeight / 2;
    const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    const transition = startViewTransition(() => this.darkMode.toggleTheme());

    void transition.ready
      .then(() => {
        const html = document.documentElement;
        const options = {
          duration: 560,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'both',
          pseudoElement: '::view-transition-new(root)',
        } as KeyframeAnimationOptions & { pseudoElement: string };

        html.animate(
          {
            clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
          },
          options,
        );
      })
      .catch(() => {});
  }

  private applyFallbackThemeTransition(): void {
    const html = document.documentElement;
    html.classList.add('theme-transition');
    window.requestAnimationFrame(() => this.darkMode.toggleTheme());
    window.setTimeout(() => html.classList.remove('theme-transition'), 280);
  }
}
