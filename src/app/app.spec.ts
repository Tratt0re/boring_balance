import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideTranslateService } from '@ngx-translate/core';

import { UpdateService } from '@/core/services/update.service';

import { App } from './app';
import { routes } from './app.routes';

const updateServiceStub = {
  updateResult: signal(null),
  updateAvailable: signal(false),
  showModal: signal(false),
  checkForUpdates: async () => undefined,
  forceCheckForUpdates: async () => undefined,
  openReleasePage: () => undefined,
  ignoreVersion: () => undefined,
  dismissModal: () => undefined,
};

describe('App', () => {
  beforeEach(async () => {
    // jsdom does not implement matchMedia, which the toast and theme code rely on.
    window.matchMedia ??= ((query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
        onchange: null,
      }) as MediaQueryList) as typeof window.matchMedia;

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
        { provide: UpdateService, useValue: updateServiceStub },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render main router host', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('main')).toBeTruthy();
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});
