import { Injectable, computed, signal } from '@angular/core';

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
export type ToolbarTitleMode = 'default' | 'breadcrumb';

export interface ToolbarTitleBreadcrumbItem {
  readonly label: string;
  readonly path?: string;
  readonly translate?: boolean;
}

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
export type ToolbarItemAction = ToolbarAction | ToolbarSelectItem;
export type ToolbarItemNavigation = ToolbarSegmentedItem;

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
  readonly titleMode?: ToolbarTitleMode;
  readonly titleBreadcrumbs?: readonly ToolbarTitleBreadcrumbItem[];
  readonly itemActions?: readonly ToolbarItemAction[];
  readonly itemNavigation?: ToolbarItemNavigation | null;
  /**
   * @deprecated Prefer `itemActions`.
   */
  readonly actions?: readonly ToolbarAction[];
  /**
   * @deprecated Prefer `itemActions` and `itemNavigation`.
   */
  readonly items?: readonly ToolbarItem[];
}

interface NormalizedToolbarContextConfig {
  readonly title: string | null;
  readonly titleMode: ToolbarTitleMode;
  readonly titleBreadcrumbs: readonly ToolbarTitleBreadcrumbItem[];
  readonly itemActions: readonly ToolbarItemAction[];
  readonly itemNavigation: ToolbarItemNavigation | null;
}

@Injectable({ providedIn: 'root' })
export class ToolbarContextService {
  private readonly titleState = signal<string | null>(null);
  private readonly titleModeState = signal<ToolbarTitleMode>('default');
  private readonly titleBreadcrumbsState = signal<readonly ToolbarTitleBreadcrumbItem[]>([]);
  private readonly itemActionsState = signal<readonly ToolbarItemAction[]>([]);
  private readonly itemNavigationState = signal<ToolbarItemNavigation | null>(null);
  private nextContextId = 1;
  private activeContextId: number | null = null;

  readonly title = this.titleState.asReadonly();
  readonly titleMode = this.titleModeState.asReadonly();
  readonly titleBreadcrumbs = this.titleBreadcrumbsState.asReadonly();
  readonly itemActions = this.itemActionsState.asReadonly();
  readonly itemNavigation = this.itemNavigationState.asReadonly();
  /**
   * @deprecated Prefer `itemActions`.
   */
  readonly actions = computed<readonly ToolbarAction[]>(() =>
    this.itemActionsState().filter((item): item is ToolbarAction => this.isToolbarAction(item)),
  );
  /**
   * @deprecated Prefer `itemActions` and `itemNavigation`.
   */
  readonly items = computed<readonly ToolbarItem[]>(() => {
    const itemNavigation = this.itemNavigationState();
    return [
      ...(itemNavigation ? [itemNavigation] : []),
      ...this.itemActionsState().filter((item): item is ToolbarSelectItem => this.isToolbarSelectItem(item)),
    ];
  });

  activate(config: ToolbarContextConfig | readonly ToolbarAction[]): () => void {
    const contextId = this.nextContextId++;
    this.activeContextId = contextId;
    const normalizedConfig = this.normalizeConfig(config);

    this.titleState.set(normalizedConfig.title ?? null);
    this.titleModeState.set(normalizedConfig.titleMode);
    this.titleBreadcrumbsState.set([...(normalizedConfig.titleBreadcrumbs ?? [])]);
    this.itemActionsState.set([...(normalizedConfig.itemActions ?? [])]);
    this.itemNavigationState.set(normalizedConfig.itemNavigation ?? null);

    return () => {
      if (this.activeContextId !== contextId) {
        return;
      }

      this.activeContextId = null;
      this.titleState.set(null);
      this.titleModeState.set('default');
      this.titleBreadcrumbsState.set([]);
      this.itemActionsState.set([]);
      this.itemNavigationState.set(null);
    };
  }

  private normalizeConfig(config: ToolbarContextConfig | readonly ToolbarAction[]): NormalizedToolbarContextConfig {
    if (this.isToolbarActionsConfig(config)) {
      return {
        title: null,
        titleMode: 'default',
        titleBreadcrumbs: [],
        itemActions: config,
        itemNavigation: null,
      };
    }

    const contextConfig = config as ToolbarContextConfig;
    const legacyItems = contextConfig.items ?? [];
    const legacyItemActions = legacyItems.filter((item): item is ToolbarSelectItem => this.isToolbarSelectItem(item));
    const legacyItemNavigations = legacyItems.filter((item): item is ToolbarSegmentedItem =>
      this.isToolbarNavigationItem(item),
    );

    if (legacyItemNavigations.length > 1) {
      console.warn('[toolbar] Only one `itemNavigation` is supported. Extra segmented items are ignored.');
    }

    const titleMode = contextConfig.titleMode ?? 'default';
    const titleBreadcrumbs = this.normalizeTitleBreadcrumbs(contextConfig.titleBreadcrumbs);
    const resolvedTitleMode: ToolbarTitleMode =
      titleMode === 'breadcrumb' && titleBreadcrumbs.length > 0 ? 'breadcrumb' : 'default';

    return {
      title: contextConfig.title ?? null,
      titleMode: resolvedTitleMode,
      titleBreadcrumbs,
      itemActions: contextConfig.itemActions ?? [...(contextConfig.actions ?? []), ...legacyItemActions],
      itemNavigation: contextConfig.itemNavigation ?? legacyItemNavigations[0] ?? null,
    };
  }

  private isToolbarActionsConfig(
    config: ToolbarContextConfig | readonly ToolbarAction[],
  ): config is readonly ToolbarAction[] {
    return Array.isArray(config);
  }

  private isToolbarAction(item: ToolbarItemAction): item is ToolbarAction {
    return 'action' in item;
  }

  private isToolbarSelectItem(item: ToolbarItem | ToolbarItemAction): item is ToolbarSelectItem {
    return 'type' in item && item.type === 'select';
  }

  private isToolbarNavigationItem(item: ToolbarItem): item is ToolbarItemNavigation {
    return item.type === 'segmented';
  }

  private normalizeTitleBreadcrumbs(
    items: readonly ToolbarTitleBreadcrumbItem[] | undefined,
  ): readonly ToolbarTitleBreadcrumbItem[] {
    if (!items || items.length === 0) {
      return [];
    }

    return items
      .filter((item) => item.label.trim().length > 0)
      .map((item) => ({
        label: item.label,
        path: item.path && item.path.trim().length > 0 ? item.path : undefined,
        translate: item.translate ?? true,
      }));
  }
}
