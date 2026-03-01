import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective } from 'ngx-echarts';

import { NumberFormatService } from '@/services/number-format.service';
import {
  observeChartThemeChanges,
  resolveChartFontFamily,
  resolveChartSeriesColor,
  resolveChartSurfaceColors,
  type AppChartThemeColor,
} from '../chart-theme';

export type AppLineChartPointSymbol =
  | 'circle'
  | 'rect'
  | 'roundRect'
  | 'triangle'
  | 'diamond'
  | 'pin'
  | 'arrow'
  | 'none';

export interface AppLineChartSeries {
  readonly data: readonly number[];
  readonly name: string;
  readonly stack?: string;
  readonly themeColor?: AppChartThemeColor;
  readonly color?: string;
  readonly smooth?: boolean;
  readonly showArea?: boolean;
  readonly areaOpacity?: number;
  readonly lineWidth?: number;
  readonly lineOpacity?: number;
  readonly pointOpacity?: number;
  readonly pointSymbol?: AppLineChartPointSymbol;
  readonly pointSize?: number;
  readonly pointBorderWidth?: number;
  readonly blendPointBorder?: boolean;
}

@Component({
  selector: 'app-line-chart',
  imports: [NgxEchartsDirective],
  templateUrl: './line-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class AppLineChartComponent implements OnInit, OnDestroy {
  private readonly numberFormatService = inject(NumberFormatService);
  private readonly themeVersion = signal(0);
  private themeObserver: MutationObserver | null = null;

  readonly labels = input.required<readonly string[]>();
  readonly series = input.required<readonly AppLineChartSeries[]>();
  readonly height = input('20rem');
  readonly showLegend = input(true, { transform: booleanAttribute });
  readonly showArea = input(false, { transform: booleanAttribute });
  readonly showPointsOnHoverOnly = input(true, { transform: booleanAttribute });
  readonly pointSize = input(7);
  readonly pointSymbol = input<AppLineChartPointSymbol>('circle');
  readonly pointBorderWidth = input(0);
  readonly blendPointBorder = input(false, { transform: booleanAttribute });
  readonly lineOpacity = input(1);
  readonly pointOpacity = input(1);
  readonly areaOpacity = input(0.8);
  readonly stacked = input(false, { transform: booleanAttribute });
  readonly stackGroup = input('total');
  readonly dimOthersOnFocus = input(false, { transform: booleanAttribute });
  readonly blurOpacity = input(0.2);
  readonly valueAxisCurrencyCode = input<string | null>(null);

  protected readonly options = computed<EChartsCoreOption>(() => {
    // Recompute options when document theme classes/attributes change.
    this.themeVersion();
    this.numberFormatService.currencyFormatStyle();
    const { background, foreground, border, tooltipBackground, tooltipForeground } = resolveChartSurfaceColors();
    const fontFamily = resolveChartFontFamily();
    const shouldDimOthersOnFocus = this.dimOthersOnFocus();
    const normalizedBlurOpacity = Math.min(Math.max(this.blurOpacity(), 0), 1);
    const renderPointsOnHoverOnly = this.showPointsOnHoverOnly();
    const normalizedPointSize = Math.max(1, this.pointSize());
    const normalizedPointBorderWidth = Math.max(0, this.pointBorderWidth());
    const shouldBlendPointBorderByDefault = this.blendPointBorder();
    const normalizedDefaultLineOpacity = Math.min(Math.max(this.lineOpacity(), 0), 1);
    const normalizedDefaultPointOpacity = Math.min(Math.max(this.pointOpacity(), 0), 1);
    const normalizedDefaultAreaOpacity = Math.min(Math.max(this.areaOpacity(), 0), 1);
    const isStacked = this.stacked();
    const normalizedCurrencyCode = this.normalizeCurrencyCode(this.valueAxisCurrencyCode());
    const currencyFormatter = normalizedCurrencyCode
      ? (value: unknown) => this.formatCurrencyValue(value, normalizedCurrencyCode)
      : null;

    const lineSeries = this.series().map((seriesItem, index) => {
      const name = seriesItem.name;
      const data = seriesItem.data;
      const smooth = seriesItem.smooth ?? true;
      const lineWidth = seriesItem.lineWidth ?? 3;
      const stack = seriesItem.stack ?? (isStacked ? this.stackGroup() : undefined);
      const showArea = seriesItem.showArea ?? this.showArea();
      const lineOpacity = Math.min(Math.max(seriesItem.lineOpacity ?? normalizedDefaultLineOpacity, 0), 1);
      const pointOpacity = Math.min(Math.max(seriesItem.pointOpacity ?? normalizedDefaultPointOpacity, 0), 1);
      const pointSize = Math.max(1, seriesItem.pointSize ?? normalizedPointSize);
      const pointSymbol = seriesItem.pointSymbol ?? this.pointSymbol();
      const pointBorderWidth = Math.max(0, seriesItem.pointBorderWidth ?? normalizedPointBorderWidth);
      const shouldBlendPointBorder = seriesItem.blendPointBorder ?? shouldBlendPointBorderByDefault;

      const color = resolveChartSeriesColor({
        color: seriesItem.color,
        themeColor: seriesItem.themeColor,
        index,
      });
      const pointBorderColor = shouldBlendPointBorder ? background : color;
      const lineStyle = {
        width: lineWidth,
        color,
        opacity: lineOpacity,
      };
      const itemStyle = {
        color,
        opacity: pointOpacity,
        borderWidth: pointBorderWidth,
        borderColor: pointBorderWidth > 0 ? pointBorderColor : undefined,
      };

      const areaOpacity = showArea
        ? Math.min(Math.max(seriesItem.areaOpacity ?? normalizedDefaultAreaOpacity, 0), 1)
        : 0;
      const areaStyle = showArea && areaOpacity > 0 ? { color, opacity: areaOpacity } : undefined;
      const shouldDimAreaOnFocus = showArea && isStacked;
      const emphasis = shouldDimOthersOnFocus
        ? {
            focus: 'series' as const,
            lineStyle: {
              width: lineWidth + 0.6,
              color,
              opacity: 1,
            },
            itemStyle: {
              color,
              opacity: pointOpacity,
              borderWidth: pointBorderWidth,
              borderColor: pointBorderWidth > 0 ? pointBorderColor : undefined,
            },
            areaStyle: shouldDimAreaOnFocus ? areaStyle : undefined,
          }
        : {
            focus: 'none' as const,
            lineStyle,
            itemStyle,
            areaStyle,
          };

      const blur = shouldDimOthersOnFocus
        ? {
            lineStyle: { opacity: lineOpacity * normalizedBlurOpacity },
            itemStyle: {
              color,
              opacity: pointOpacity * normalizedBlurOpacity,
              borderWidth: pointBorderWidth,
              borderColor: pointBorderWidth > 0 ? pointBorderColor : undefined,
            },
            areaStyle:
              shouldDimAreaOnFocus && areaStyle ? { opacity: areaOpacity * normalizedBlurOpacity } : undefined,
          }
        : undefined;

      return {
        name,
        type: 'line' as const,
        showSymbol: !renderPointsOnHoverOnly,
        symbol: pointSymbol,
        symbolSize: pointSize,
        stack,
        smooth,
        data,
        lineStyle,
        itemStyle,
        areaStyle,
        emphasis,
        blur,
      };
    });

    return {
      textStyle: {
        fontFamily,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBackground,
        borderColor: border,
        borderWidth: 1,
        textStyle: {
          color: tooltipForeground,
          fontFamily,
        },
        axisPointer: {
          type: 'cross',
          label: {
            backgroundColor: tooltipBackground,
            borderColor: border,
            borderWidth: 1,
            color: tooltipForeground,
            fontFamily,
            ...(currencyFormatter
              ? {
                  formatter: (params: { axisDimension?: string; value?: unknown }) =>
                    params?.axisDimension === 'y'
                      ? currencyFormatter(params.value)
                      : `${params?.value ?? ''}`,
                }
              : {}),
          },
        },
        ...(currencyFormatter
          ? {
              valueFormatter: (value: unknown) => currencyFormatter(value),
            }
          : {}),
      },
      legend: {
        show: this.showLegend() && lineSeries.length > 0,
        bottom: 0,
        textStyle: {
          color: foreground,
          fontFamily,
        },
      },
      grid: {
        left: 12,
        right: 12,
        top: 24,
        bottom: this.showLegend() ? 44 : 18,
        outerBoundsMode: 'same',
        outerBoundsContain: 'axisLabel',
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: this.labels(),
        axisLabel: {
          color: foreground,
          fontFamily,
        },
        axisLine: { lineStyle: { color: border } },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: foreground,
          fontFamily,
          ...(currencyFormatter
            ? {
                formatter: (value: number | string) => currencyFormatter(value),
              }
            : {}),
        },
        splitLine: { lineStyle: { color: border } },
      },
      series: lineSeries,
    };
  });

  ngOnInit(): void {
    this.themeObserver = observeChartThemeChanges(() => {
      this.themeVersion.update((currentVersion) => currentVersion + 1);
    });
  }

  ngOnDestroy(): void {
    this.themeObserver?.disconnect();
    this.themeObserver = null;
  }

  private normalizeCurrencyCode(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? this.numberFormatService.normalizeCurrencySymbol(normalizedValue) : null;
  }

  private formatCurrencyValue(value: unknown, currencyCode: string): string {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return `${value ?? ''}`;
    }

    return this.numberFormatService.formatCurrency(numericValue, currencyCode);
  }
}
