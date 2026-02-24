import { Component, input, output, ViewEncapsulation } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { SidebarToggleComponent } from '@/components/sidebar-toggle/sidebar-toggle.component';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDividerComponent } from '@/shared/components/divider';
import { ZardIconComponent } from '@/shared/components/icon';
import { ZardSegmentedComponent, ZardSegmentedItemComponent } from '@/shared/components/segmented';
import { ZardSelectImports } from '@/shared/components/select';
import { HeaderComponent } from '@/shared/components/layout/header.component';
import type { ToolbarAction, ToolbarItem, ToolbarSegmentedItem, ToolbarSelectItem } from '@/services/toolbar-context.service';

@Component({
  selector: 'app-toolbar',
  imports: [
    HeaderComponent,
    SidebarToggleComponent,
    TranslatePipe,
    ZardButtonComponent,
    ZardDividerComponent,
    ZardIconComponent,
    ZardSegmentedComponent,
    ZardSegmentedItemComponent,
    ...ZardSelectImports,
  ],
  templateUrl: './toolbar.html',
  encapsulation: ViewEncapsulation.None,
})
export class Toolbar {
  readonly sidebarCollapsed = input(false);
  readonly title = input<string | null>(null);
  readonly items = input<readonly ToolbarItem[]>([]);
  readonly actions = input<readonly ToolbarAction[]>([]);
  readonly sidebarToggle = output<void>();

  protected onSidebarToggle(): void {
    this.sidebarToggle.emit();
  }

  protected isActionDisabled(action: ToolbarAction): boolean {
    if (typeof action.disabled === 'function') {
      return action.disabled();
    }

    return action.disabled ?? false;
  }

  protected onActionClick(action: ToolbarAction): void {
    if (this.isActionDisabled(action)) {
      return;
    }

    try {
      const result = action.action();
      if (result && typeof result.then === 'function') {
        void result.catch((error) => {
          console.error('[toolbar] Toolbar action failed:', error);
        });
      }
    } catch (error) {
      console.error('[toolbar] Toolbar action failed:', error);
    }
  }

  protected isSegmentedItem(item: ToolbarItem): item is ToolbarSegmentedItem {
    return item.type === 'segmented';
  }

  protected isSelectItem(item: ToolbarItem): item is ToolbarSelectItem {
    return item.type === 'select';
  }

  protected segmentedItems(): readonly ToolbarSegmentedItem[] {
    return this.items().filter((item): item is ToolbarSegmentedItem => this.isSegmentedItem(item));
  }

  protected nonSegmentedItems(): readonly Exclude<ToolbarItem, ToolbarSegmentedItem>[] {
    return this.items().filter((item): item is Exclude<ToolbarItem, ToolbarSegmentedItem> => !this.isSegmentedItem(item));
  }

  protected isToolbarItemDisabled(item: { disabled?: boolean | (() => boolean) }): boolean {
    if (typeof item.disabled === 'function') {
      return item.disabled();
    }

    return item.disabled ?? false;
  }

  protected resolveSelectItemValue(item: ToolbarSelectItem): string {
    const value = typeof item.value === 'function' ? item.value() : item.value;
    return typeof value === 'string' ? value : '';
  }

  protected onSegmentedItemChange(item: ToolbarSegmentedItem, value: string): void {
    try {
      const result = item.change(value);
      if (result && typeof result.then === 'function') {
        void result.catch((error) => {
          console.error('[toolbar] Toolbar item change handler failed:', error);
        });
      }
    } catch (error) {
      console.error('[toolbar] Toolbar item change handler failed:', error);
    }
  }

  protected onSelectItemChange(item: ToolbarSelectItem, value: string | string[]): void {
    if (Array.isArray(value)) {
      return;
    }

    try {
      const result = item.change(value);
      if (result && typeof result.then === 'function') {
        void result.catch((error) => {
          console.error('[toolbar] Toolbar item change handler failed:', error);
        });
      }
    } catch (error) {
      console.error('[toolbar] Toolbar item change handler failed:', error);
    }
  }
}
