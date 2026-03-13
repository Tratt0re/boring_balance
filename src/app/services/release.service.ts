import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, map, of, timeout } from 'rxjs';

import { APP_CONFIG } from '../config';

export type Platform = 'windows' | 'macos' | 'linux';

export type ReleaseState =
  | { status: 'loading' }
  | { status: 'ready'; urls: Record<Platform, string> }
  | { status: 'error' };

interface GithubRelease {
  assets: GithubAsset[];
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
};

@Injectable({ providedIn: 'root' })
export class ReleaseService {
  private readonly http = inject(HttpClient);

  readonly platform = signal<Platform | null>(this.detectPlatform());
  readonly releaseState = signal<ReleaseState>({ status: 'loading' });

  readonly platformLabel = computed(() => {
    const p = this.platform();
    return p ? PLATFORM_LABELS[p] : null;
  });

  readonly primaryLabel = computed(() => {
    const p = this.platform();
    return p ? `Download for ${PLATFORM_LABELS[p]}` : 'Download Boring Balance';
  });

  readonly primaryUrl = computed((): string => {
    const state = this.releaseState();
    const p = this.platform();
    const urls = state.status === 'ready' ? state.urls : APP_CONFIG.fallback;
    return p ? (urls as Record<Platform, string>)[p] : `${APP_CONFIG.repoUrl}/releases/latest`;
  });

  readonly isLoading = computed(() => this.releaseState().status === 'loading');
  readonly availabilityNote = computed(() => {
    const state = this.releaseState();
    const detectedPlatform = this.platformLabel();

    if (state.status === 'error') {
      return 'Installer lookup is unavailable right now. The download button opens GitHub Releases instead.';
    }

    if (state.status === 'loading') {
      return detectedPlatform
        ? `Looking up the latest ${detectedPlatform} installer. GitHub Releases are available immediately.`
        : 'Looking up the latest installer. GitHub Releases are available immediately.';
    }

    if (detectedPlatform) {
      return `Suggested for ${detectedPlatform}.`;
    }

    return 'Windows, macOS, and Linux builds are available.';
  });

  readonly otherPlatforms = computed(() =>
    (['windows', 'macos', 'linux'] as Platform[]).filter((p) => p !== this.platform()),
  );

  constructor() {
    this.loadRelease();
  }

  private detectPlatform(): Platform | null {
    if (typeof navigator === 'undefined') return null;
    const raw = (
      // @ts-expect-error userAgentData is experimental
      (navigator.userAgentData?.platform as string | undefined) ?? navigator.userAgent
    ).toLowerCase();
    if (raw.includes('win')) return 'windows';
    if (raw.includes('mac')) return 'macos';
    if (raw.includes('linux')) return 'linux';
    return null;
  }

  private loadRelease(): void {
    this.http
      .get<GithubRelease>(APP_CONFIG.releasesApiUrl)
      .pipe(
        timeout(2500),
        map((r) => this.resolveUrls(r.assets)),
        catchError(() => {
          this.releaseState.set({ status: 'error' });
          return of(null);
        }),
      )
      .subscribe((urls) => {
        if (!urls) return;
        this.releaseState.set({ status: 'ready', urls: urls as Record<Platform, string> });
      });
  }

  private resolveUrls(assets: GithubAsset[]): Record<Platform, string> {
    return {
      windows: this.match(assets, 'windows'),
      macos: this.match(assets, 'macos'),
      linux: this.match(assets, 'linux'),
    };
  }

  private match(assets: GithubAsset[], platform: Platform): string {
    for (const pattern of APP_CONFIG.assetPatterns[platform]) {
      const hit = assets.find((a) => (pattern as RegExp).test(a.name));
      if (hit) return hit.browser_download_url;
    }
    return APP_CONFIG.fallback[platform];
  }

  getPlatformLabel(platform: Platform): string {
    return PLATFORM_LABELS[platform];
  }
}
