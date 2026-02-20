import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';

import { echarts } from '@/config/echarts.config';
import { routes } from './app.routes';
import { provideI18n } from '@/shared/core/provider/providei18n';
import { provideZard } from '@/shared/core/provider/providezard';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideI18n(),
    provideZard(),
    provideEchartsCore({ echarts }),
  ],
};
