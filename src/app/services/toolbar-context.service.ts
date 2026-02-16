import { Injectable, signal } from '@angular/core';

import type {
  ZardButtonShapeVariants,
  ZardButtonSizeVariants,
  ZardButtonTypeVariants,
} from '@/shared/components/button';
import type { ZardIcon } from '@/shared/components/icon';

type ToolbarActionHandler = () => void | Promise<void>;
type ToolbarActionDisabled = boolean | (() => boolean);

export interface ToolbarAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: ZardIcon;
  readonly buttonType?: ZardButtonTypeVariants;
  readonly buttonSize?: ZardButtonSizeVariants;
  readonly buttonShape?: ZardButtonShapeVariants;
  readonly disabled?: ToolbarActionDisabled;
  readonly action: ToolbarActionHandler;
}

export interface ToolbarContextConfig {
  readonly title?: string | null;
  readonly actions?: readonly ToolbarAction[];
}

@Injectable({ providedIn: 'root' })
export class ToolbarContextService {
  private readonly titleState = signal<string | null>(null);
  private readonly actionsState = signal<readonly ToolbarAction[]>([]);
  private nextContextId = 1;
  private activeContextId: number | null = null;

  readonly title = this.titleState.asReadonly();
  readonly actions = this.actionsState.asReadonly();

  activate(config: ToolbarContextConfig | readonly ToolbarAction[]): () => void {
    const contextId = this.nextContextId++;
    this.activeContextId = contextId;
    const normalizedConfig = this.normalizeConfig(config);

    this.titleState.set(normalizedConfig.title ?? null);
    this.actionsState.set([...(normalizedConfig.actions ?? [])]);

    return () => {
      if (this.activeContextId !== contextId) {
        return;
      }

      this.activeContextId = null;
      this.titleState.set(null);
      this.actionsState.set([]);
    };
  }

  private normalizeConfig(config: ToolbarContextConfig | readonly ToolbarAction[]): ToolbarContextConfig {
    if (Array.isArray(config)) {
      return { actions: config, title: null };
    }

    return config as ToolbarContextConfig;
  }
}
