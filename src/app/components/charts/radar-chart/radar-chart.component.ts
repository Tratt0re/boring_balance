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

export type AppRadarChartShape = 'polygon' | 'circle';

export interface AppRadarChartIndicator {
  readonly name: string;
  readonly max?: number;
  readonly min?: number;
}

export interface AppRadarChartSeries {
  readonly name: string;
  readonly value: readonly number[];
  readonly themeColor?: AppChartThemeColor;
  readonly color?: string;
  readonly showArea?: boolean;
  readonly areaOpacity?: number;
  readonly lineWidth?: number;
  readonly lineOpacity?: number;
  readonly pointOpacity?: number;
  readonly pointSize?: number;
}

@Component({
  selector: 'app-radar-chart',
  imports: [NgxEchartsDirective],
  templateUrl: './radar-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class AppRadarChartComponent implements OnInit, OnDestroy {
  private readonly numberFormatService = inject(NumberFormatService);
  private readonly themeVersion = signal(0);
  private themeObserver: MutationObserver | null = null;

  readonly indicators = input.required<readonly AppRadarChartIndicator[]>();
  readonly series = input.required<readonly AppRadarChartSeries[]>();
  readonly height = input('20rem');
  readonly showLegend = input(true, { transform: booleanAttribute });
  readonly showArea = input(false, { transform: booleanAttribute });
  readonly areaOpacity = input(0.22);
  readonly lineOpacity = input(1);
  readonly pointOpacity = input(1);
  readonly pointSize = input(5);
  readonly splitNumber = input(4);
  readonly shape = input<AppRadarChartShape>('polygon');
  readonly radius = input('62%');
  readonly dimOthersOnFocus = input(false, { transform: booleanAttribute });
  readonly blurOpacity = input(0.2);
  readonly tooltipCurrencyCode = input<string | null>(null);

  protected readonly options = computed<EChartsCoreOption>(() => {
    // Recompute options when document theme classes/attributes change.
    this.themeVersion();
    this.numberFormatService.currencyFormatStyle();
    const { foreground, border, tooltipBackground, tooltipForeground } = resolveChartSurfaceColors();
    const fontFamily = resolveChartFontFamily();
    const sourceSeries = this.series();
    const sourceIndicators = this.indicators();
    const shouldDimOthersOnFocus = this.dimOthersOnFocus();
    const normalizedBlurOpacity = Math.min(Math.max(this.blurOpacity(), 0), 1);
    const normalizedDefaultAreaOpacity = Math.min(Math.max(this.areaOpacity(), 0), 1);
    const normalizedDefaultLineOpacity = Math.min(Math.max(this.lineOpacity(), 0), 1);
    const normalizedDefaultPointOpacity = Math.min(Math.max(this.pointOpacity(), 0), 1);
    const normalizedDefaultPointSize = Math.max(1, this.pointSize());
    const normalizedSplitNumber = Math.max(1, Math.round(this.splitNumber()));
    const normalizedTooltipCurrencyCode = this.normalizeCurrencyCode(this.tooltipCurrencyCode());

    const values = sourceSeries.flatMap((item) => item.value);
    const autoMax = values.length > 0 ? Math.max(...values) : 100;
    const normalizedAutoMax = autoMax <= 0 ? 100 : autoMax;

    const normalizedIndicators = sourceIndicators.map((indicator) => ({
      name: indicator.name,
      min: indicator.min ?? 0,
      max: indicator.max ?? normalizedAutoMax,
    }));

    const radarSeries = sourceSeries.map((seriesItem, index) => {
      const color = resolveChartSeriesColor({
        color: seriesItem.color,
        themeColor: seriesItem.themeColor,
        index,
      });
      const showArea = seriesItem.showArea ?? this.showArea();
      const lineWidth = Math.max(1, seriesItem.lineWidth ?? 2.4);
      const lineOpacity = Math.min(Math.max(seriesItem.lineOpacity ?? normalizedDefaultLineOpacity, 0), 1);
      const pointOpacity = Math.min(Math.max(seriesItem.pointOpacity ?? normalizedDefaultPointOpacity, 0), 1);
      const pointSize = Math.max(1, seriesItem.pointSize ?? normalizedDefaultPointSize);
      const areaOpacity = showArea ? Math.min(Math.max(seriesItem.areaOpacity ?? normalizedDefaultAreaOpacity, 0), 1) : 0;

      const lineStyle = {
        color,
        width: lineWidth,
        opacity: lineOpacity,
      };
      const itemStyle = {
        color,
        opacity: pointOpacity,
      };
      const areaStyle = showArea && areaOpacity > 0
        ? {
            color,
            opacity: areaOpacity,
          }
        : undefined;

      return {
        type: 'radar' as const,
        name: seriesItem.name,
        data: [
          {
            name: seriesItem.name,
            value: seriesItem.value,
          },
        ],
        symbol: 'circle' as const,
        symbolSize: pointSize,
        lineStyle,
        itemStyle,
        areaStyle,
        emphasis: shouldDimOthersOnFocus
          ? {
              focus: 'series' as const,
              lineStyle: {
                color,
                width: lineWidth + 0.6,
                opacity: 1,
              },
              itemStyle: {
                color,
                opacity: pointOpacity,
              },
              areaStyle,
            }
          : {
              focus: 'none' as const,
            },
        blur: shouldDimOthersOnFocus
          ? {
              lineStyle: {
                opacity: lineOpacity * normalizedBlurOpacity,
              },
              itemStyle: {
                color,
                opacity: pointOpacity * normalizedBlurOpacity,
              },
              areaStyle: areaStyle
                ? {
                    opacity: areaOpacity * normalizedBlurOpacity,
                  }
                : undefined,
            }
          : undefined,
      };
    });

    return {
      textStyle: {
        fontFamily,
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: tooltipBackground,
        borderColor: border,
        borderWidth: 1,
        textStyle: {
          color: tooltipForeground,
          fontFamily,
        },
        formatter: (params: unknown) =>
          this.formatTooltip(params, normalizedIndicators, normalizedTooltipCurrencyCode),
      },
      legend: {
        show: this.showLegend() && radarSeries.length > 0,
        bottom: 0,
        textStyle: {
          color: foreground,
          fontFamily,
        },
      },
      radar: {
        shape: this.shape(),
        radius: this.radius(),
        splitNumber: normalizedSplitNumber,
        center: ['50%', this.showLegend() ? '44%' : '50%'],
        indicator: normalizedIndicators,
        axisName: {
          color: foreground,
          fontFamily,
        },
        axisLine: {
          lineStyle: {
            color: border,
            opacity: 0.7,
          },
        },
        splitLine: {
          lineStyle: {
            color: border,
            opacity: 0.7,
          },
        },
        splitArea: {
          areaStyle: {
            color: ['transparent'],
          },
        },
      },
      series: [
        ...radarSeries,
      ],
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

  private formatTooltip(
    params: unknown,
    indicators: ReadonlyArray<{ name: string; min: number; max: number }>,
    currencyCode: string | null,
  ): string {
    const tooltipParams = params as {
      seriesName?: string;
      marker?: string;
      value?: unknown;
      data?: { value?: unknown } | null;
    };
    const marker = typeof tooltipParams?.marker === 'string' ? tooltipParams.marker : '';
    const seriesName =
      typeof tooltipParams?.seriesName === 'string' && tooltipParams.seriesName.trim().length > 0
        ? tooltipParams.seriesName
        : '';
    const rawValue =
      tooltipParams?.value &&
      typeof tooltipParams.value === 'object' &&
      !Array.isArray(tooltipParams.value) &&
      'value' in (tooltipParams.value as object)
        ? (tooltipParams.value as { value?: unknown }).value
        : (tooltipParams?.value ?? tooltipParams?.data?.value);
    const valueList = Array.isArray(rawValue) ? rawValue : [];
    const labelStyle = 'font-weight: 300; opacity: 0.78;';
    const valueStyle = 'font-weight: 700;';
    const lines: string[] = [];

    if (seriesName.length > 0) {
      const safeSeriesName = this.escapeHtml(seriesName);
      lines.push(
        marker.length > 0
          ? `${marker} <strong style="${valueStyle}">${safeSeriesName}</strong>`
          : `<strong style="${valueStyle}">${safeSeriesName}</strong>`,
      );
    }

    for (let index = 0; index < indicators.length; index += 1) {
      const indicator = indicators[index];
      const rawItemValue = valueList[index];
      const formattedValue = currencyCode
        ? this.formatCurrencyValue(rawItemValue, currencyCode)
        : this.formatNumberValue(rawItemValue);

      lines.push(
        `<span style="${labelStyle}">${this.escapeHtml(indicator.name)}:</span> ` +
          `<strong style="${valueStyle}">${this.escapeHtml(formattedValue)}</strong>`,
      );
    }

    return lines.join('<br/>');
  }

  private formatNumberValue(value: unknown): string {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return `${value ?? ''}`;
    }

    return this.numberFormatService.formatNumber(numericValue);
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
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
