import { Component, computed, input } from '@angular/core';

import type { CurrencyFormatStyle, CurrencySymbol } from '@/config/local-preferences.config';
import { formatCurrency } from '@/shared/utils/number-format';

@Component({
  selector: 'app-currency-preview',
  template: `{{ previewValue() }}`,
  host: {
    class: 'block text-sm font-medium money',
  },
})
export class CurrencyPreviewComponent {
  readonly symbol = input.required<CurrencySymbol>();
  readonly displayStyle = input.required<CurrencyFormatStyle>();
  readonly sampleValue = input(1_234_567.89);

  protected readonly previewValue = computed(() =>
    formatCurrency(this.sampleValue(), this.symbol(), this.displayStyle(), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  );
}
