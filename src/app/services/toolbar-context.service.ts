import { Injectable, signal } from '@angular/core';

import type {
  ZardButtonShapeVariants,
  ZardButtonSizeVariants,
  ZardButtonTypeVariants,
} from '@/shared/components/button';
import type { ZardIcon } from '@/shared/components/icon';
import type { ZardSelectSizeVariants } from '@/shared/components/select';

type ToolbarActionHandler = () => void | Promise<void>;
type ToolbarActionDisabled = boolean | (() => boolean);
type ToolbarSegmentedChangeHandler = (value: string) => void | Promise<void>;
type ToolbarSelectChangeHandler = (value: string) => void | Promise<void>;
type ToolbarDynamicString = string | (() => string);
type ToolbarItemDisabled = boolean | (() => boolean);

export interface ToolbarSegmentedOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface ToolbarSegmentedItem {
  readonly id: string;
  readonly type: 'segmented';
  readonly ariaLabel?: string;
  readonly size?: 'sm' | 'default' | 'lg';
  readonly defaultValue?: string;
  readonly options: readonly ToolbarSegmentedOption[];
  readonly change: ToolbarSegmentedChangeHandler;
}

export interface ToolbarSelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface ToolbarSelectItem {
  readonly id: string;
  readonly type: 'select';
  readonly label?: string;
  readonly ariaLabel?: string;
  readonly size?: ZardSelectSizeVariants;
  readonly value: ToolbarDynamicString;
  readonly placeholder?: string;
  readonly class?: string;
  readonly disabled?: ToolbarItemDisabled;
  readonly options: readonly ToolbarSelectOption[];
  readonly change: ToolbarSelectChangeHandler;
}

export type ToolbarItem = ToolbarSegmentedItem | ToolbarSelectItem;

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
  readonly items?: readonly ToolbarItem[];
}

@Injectable({ providedIn: 'root' })
export class ToolbarContextService {
  private readonly titleState = signal<string | null>(null);
  private readonly actionsState = signal<readonly ToolbarAction[]>([]);
  private readonly itemsState = signal<readonly ToolbarItem[]>([]);
  private nextContextId = 1;
  private activeContextId: number | null = null;

  readonly title = this.titleState.asReadonly();
  readonly actions = this.actionsState.asReadonly();
  readonly items = this.itemsState.asReadonly();

  activate(config: ToolbarContextConfig | readonly ToolbarAction[]): () => void {
    const contextId = this.nextContextId++;
    this.activeContextId = contextId;
    const normalizedConfig = this.normalizeConfig(config);

    this.titleState.set(normalizedConfig.title ?? null);
    this.actionsState.set([...(normalizedConfig.actions ?? [])]);
    this.itemsState.set([...(normalizedConfig.items ?? [])]);

    return () => {
      if (this.activeContextId !== contextId) {
        return;
      }

      this.activeContextId = null;
      this.titleState.set(null);
      this.actionsState.set([]);
      this.itemsState.set([]);
    };
  }

  private normalizeConfig(config: ToolbarContextConfig | readonly ToolbarAction[]): ToolbarContextConfig {
    if (Array.isArray(config)) {
      return { actions: config, title: null };
    }

    return config as ToolbarContextConfig;
  }
}
