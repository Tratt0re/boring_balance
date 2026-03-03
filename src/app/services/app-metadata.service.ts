import { Injectable } from '@angular/core';

import type { ElectronAppInfo } from '@/config/api';

const EMPTY_APP_INFO: ElectronAppInfo = Object.freeze({
  name: null,
  version: null,
  author: null,
  repositoryUrl: null,
});

@Injectable({
  providedIn: 'root',
})
export class AppMetadataService {
  readonly appInfo = this.readAppInfo();

  private readAppInfo(): ElectronAppInfo {
    if (typeof window === 'undefined') {
      return EMPTY_APP_INFO;
    }

    const appInfo = window.electronAPI?.appInfo;
    if (!appInfo) {
      return EMPTY_APP_INFO;
    }

    return {
      name: this.normalizeText(appInfo.name),
      version: this.normalizeText(appInfo.version),
      author: this.normalizeText(appInfo.author),
      repositoryUrl: this.normalizeText(appInfo.repositoryUrl),
    };
  }

  private normalizeText(value: string | null | undefined): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }
}
