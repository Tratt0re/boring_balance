import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { App } from './app';
import { APP_CONFIG } from './config';
import { Platform, ReleaseService, ReleaseState } from './services/release.service';

describe('App', () => {
  beforeEach(async () => {
    const urls = {
      windows: APP_CONFIG.releaseUrl,
      macos: APP_CONFIG.releaseUrl,
      linux: APP_CONFIG.releaseUrl,
    };

    const releaseServiceStub = {
      platformLabel: signal('macOS'),
      primaryLabel: signal('Download for macOS'),
      primaryUrl: signal(APP_CONFIG.releaseUrl),
      isLoading: signal(false),
      otherPlatforms: signal<Platform[]>(['windows', 'linux']),
      releaseState: signal<ReleaseState>({ status: 'ready', urls }),
      getPlatformLabel: (platform: Platform) =>
        ({ windows: 'Windows', macos: 'macOS', linux: 'Linux' })[platform],
    } as unknown as ReleaseService;

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        {
          provide: ReleaseService,
          useValue: releaseServiceStub,
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the landing page headline', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(
      'Simple, private, boring',
    );
  });

  it('should render the landing page FAQ section', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('A few quick answers.');
  });

  it('should apply landing page SEO metadata', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(document.title).toBe(APP_CONFIG.seo.title);
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      APP_CONFIG.seo.description,
    );
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      APP_CONFIG.seo.canonicalUrl,
    );
    expect(document.querySelector('#boring-balance-structured-data')).toBeTruthy();
  });
});
