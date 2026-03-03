import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardIconComponent } from '@/shared/components/icon';
import { EDarkModes, ZardDarkMode } from '@/shared/services/dark-mode';
import { applyThemeTransition } from '@/shared/utils/theme-transition';

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
    applyThemeTransition(this.darkMode, { origin: event });
  }
}
