import { Component, inject } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-general-section',
  imports: [TranslatePipe],
  templateUrl: './general-section.component.html',
  styleUrl: './general-section.component.scss',
})
export class GeneralSectionComponent {
  private readonly translateService = inject(TranslateService);

  protected get currentLanguageLabel(): string {
    const language = this.translateService.currentLang || this.translateService.getCurrentLang() || 'en';

    switch (language) {
      case 'en':
        return 'English';
      case 'it':
        return 'Italiano';
      case 'es':
        return 'Espanol';
      default:
        return typeof language === 'string' && language.trim().length > 0
          ? language.toUpperCase()
          : this.translateService.instant('settings.general.language.system');
    }
  }
}
