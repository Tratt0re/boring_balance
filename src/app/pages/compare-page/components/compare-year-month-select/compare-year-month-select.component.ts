import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ZardSelectImports } from '@/shared/components/select';

const MONTHS_IN_YEAR = 12;

export interface CompareYearMonthSelectOption {
  readonly value: string;
  readonly label: string;
}

@Component({
  selector: 'app-compare-year-month-select',
  imports: [
    TranslatePipe,
    ...ZardSelectImports,
  ],
  templateUrl: './compare-year-month-select.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompareYearMonthSelectComponent {
  readonly titleKey = input('compare.selectors.left.title');
  readonly periodLabel = input('');
  readonly yearValue = input(new Date().getFullYear());
  readonly monthValue = input(new Date().getMonth());
  readonly yearOptions = input<readonly CompareYearMonthSelectOption[]>([]);
  readonly monthOptions = input<readonly CompareYearMonthSelectOption[]>([]);

  readonly yearChange = output<number>();
  readonly monthChange = output<number>();

  protected onYearSelectionChange(value: string | string[]): void {
    if (Array.isArray(value)) {
      return;
    }

    const nextYear = Number.parseInt(value, 10);
    if (!Number.isInteger(nextYear)) {
      return;
    }

    this.yearChange.emit(nextYear);
  }

  protected onMonthSelectionChange(value: string | string[]): void {
    if (Array.isArray(value)) {
      return;
    }

    const nextMonthIndex = Number.parseInt(value, 10);
    if (!Number.isInteger(nextMonthIndex) || nextMonthIndex < 0 || nextMonthIndex >= MONTHS_IN_YEAR) {
      return;
    }

    this.monthChange.emit(nextMonthIndex);
  }
}
