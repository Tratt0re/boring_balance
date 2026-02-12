import { Component, inject, ViewEncapsulation } from '@angular/core';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardIconComponent } from '@/shared/components/icon';
import { HeaderComponent } from '@/shared/components/layout/header.component';
import { EDarkModes, ZardDarkMode } from '@/shared/services/dark-mode';

@Component({
  selector: 'app-header',
  imports: [HeaderComponent, ZardButtonComponent, ZardIconComponent],
  templateUrl: './header.html',
  encapsulation: ViewEncapsulation.None,
})
export class Header {
  protected readonly EDarkModes = EDarkModes;
  protected readonly darkMode = inject(ZardDarkMode);

  protected toggleTheme(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const html = document.documentElement;
    html.classList.add('theme-transition');
    window.requestAnimationFrame(() => this.darkMode.toggleTheme());
    window.setTimeout(() => html.classList.remove('theme-transition'), 280);
  }
}
