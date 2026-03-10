import { Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';

import { TranslateService } from '@ngx-translate/core';
import { map, startWith } from 'rxjs';

import { RootLayout } from '@/layout/root-layout/root-layout';
import { ZardToastComponent } from '@/shared/components/toast';

@Component({
  selector: 'app-root',
  imports: [RootLayout, RouterOutlet, ZardToastComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly translateService = inject(TranslateService);

  private readonly lang = toSignal(
    this.translateService.onLangChange.pipe(
      map((e) => e.lang),
      startWith(this.translateService.getCurrentLang() ?? 'en'),
    ),
  );

  constructor() {
    effect(() => {
      document.documentElement.lang = this.lang() ?? 'en';
    });
  }
}
