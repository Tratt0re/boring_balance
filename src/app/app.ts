import { Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';

import { TranslateService } from '@ngx-translate/core';
import { map, startWith } from 'rxjs';

import { RootLayout } from '@/layout/root-layout/root-layout';
import { ZardToastComponent } from '@/shared/components/toast';
import { UpdateModalComponent } from '@/shared/components/update-modal/update-modal.component';
import { UpdateService } from '@/core/services/update.service';

@Component({
  selector: 'app-root',
  imports: [RootLayout, RouterOutlet, ZardToastComponent, UpdateModalComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly translateService = inject(TranslateService);
  protected readonly updateService = inject(UpdateService);

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
    this.updateService.checkForUpdates();
  }
}
