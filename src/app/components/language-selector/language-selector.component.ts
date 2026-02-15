import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { I18nService } from '@/services/i18n.service';
import { ZardButtonComponent } from '@/shared/components/button';
import {
  ZardDropdownDirective,
  ZardDropdownMenuContentComponent,
  ZardDropdownMenuItemComponent,
} from '@/shared/components/dropdown';
import { ZardIconComponent } from '@/shared/components/icon';

@Component({
  selector: 'app-language-selector',
  imports: [
    ZardButtonComponent,
    ZardDropdownDirective,
    ZardDropdownMenuContentComponent,
    ZardDropdownMenuItemComponent,
    ZardIconComponent,
    TranslatePipe,
  ],
  templateUrl: './language-selector.component.html',
})
export class LanguageSelectorComponent {
  private readonly i18nService = inject(I18nService);

  protected readonly languages = this.i18nService.supportedLanguages;
  protected readonly selectedLanguage = this.i18nService.language;

  protected getLanguageLabelKey(language: string): string {
    return `header.language.options.${language}`;
  }

  protected onLanguageChange(language: string): void {
    void this.i18nService.use(language);
  }
}
