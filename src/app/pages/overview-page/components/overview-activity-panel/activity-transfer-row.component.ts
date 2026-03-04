import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MessageSquareText } from 'lucide-angular';

import { NumberFormatService } from '@/services/number-format.service';
import { ZardIconComponent } from '@/shared/components/icon';
import { ZardSwitchComponent } from '@/shared/components/switch';
import { ZardTooltipImports } from '@/shared/components/tooltip';
import type { ActivityTransferRow } from './activity-row.types';

@Component({
  selector: 'app-activity-transfer-row',
  imports: [
    ZardIconComponent,
    ZardSwitchComponent,
    ...ZardTooltipImports,
  ],
  templateUrl: './activity-transfer-row.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class ActivityTransferRowComponent {
  readonly row = input.required<ActivityTransferRow>();
  readonly isPending = input(false);
  readonly settledChange = output<boolean>();

  protected readonly descriptionIndicatorIcon = MessageSquareText;

  constructor(
    private readonly numberFormatService: NumberFormatService,
    private readonly translateService: TranslateService,
  ) {}

  protected settledStatusTooltip(settled: boolean): string {
    return this.translate(
      settled
        ? 'overview.cards.recentTransactions.tooltips.settled'
        : 'overview.cards.recentTransactions.tooltips.unsettled',
    );
  }

  protected settledToggleActionLabel(settled: boolean): string {
    return this.translate(
      settled
        ? 'overview.cards.recentTransactions.tooltips.unsettled'
        : 'overview.cards.recentTransactions.tooltips.settle',
    );
  }

  protected formatActivityDate(timestampMs: number): string {
    const date = new Date(timestampMs);
    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();

    return new Intl.DateTimeFormat(this.resolveLocale(), {
      weekday: 'short',
      day: '2-digit',
      month: 'long',
      ...(sameYear ? {} : { year: 'numeric' }),
    }).format(date);
  }

  protected formatAmount(amount: number): string {
    return this.numberFormatService.formatCurrency(amount);
  }

  private resolveLocale(): string {
    const currentLanguage = this.translateService.currentLang?.trim();
    return currentLanguage && currentLanguage.length > 0 ? currentLanguage : 'en';
  }

  private translate(key: string): string {
    const translated = this.translateService.instant(key);
    return typeof translated === 'string' ? translated : key;
  }
}
