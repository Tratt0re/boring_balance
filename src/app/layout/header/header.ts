import { Component, ViewEncapsulation } from '@angular/core';

import { LanguageSelectorComponent } from '@/components/language-selector/language-selector.component';
import { ThemeToggleComponent } from '@/components/theme-toggle/theme-toggle.component';
import { HeaderComponent } from '@/shared/components/layout/header.component';

@Component({
  selector: 'app-header',
  imports: [HeaderComponent, LanguageSelectorComponent, ThemeToggleComponent],
  templateUrl: './header.html',
  encapsulation: ViewEncapsulation.None,
})
export class Header {}
