import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective } from 'ngx-echarts';

import {
  observeChartThemeChanges,
  resolveChartFontFamily,
  resolveChartSeriesColor,
  resolveChartSurfaceColors,
  type AppChartThemeColor,
} from '../chart-theme';

export type AppBarChartAxisPointerType = 'shadow' | 'line' | 'cross' | 'none';
export type AppBarChartOrientation = 'vertical' | 'horizontal';
export type AppBarChartTooltipTrigger = 'axis' | 'item';

export interface AppBarChartSeries {
  readonly data: readonly number[];
  readonly name: string;
  readonly stack?: string;
  readonly barWidth?: number | string;
  readonly cornerRadius?: number;
  readonly borderRadius?: number | readonly [number, number, number, number];
  readonly themeColor?: AppChartThemeColor;
  readonly color?: string;
  readonly tooltipValueText?: string;
  readonly tooltipValueTextByIndex?: readonly string[];
  readonly tooltipDetails?: readonly string[];
  readonly tooltipDetailsOnly?: boolean;
  readonly tooltipHideValue?: boolean;
}

@Component({
  selector: 'app-bar-chart',
  imports: [NgxEchartsDirective],
  templateUrl: './bar-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class AppBarChartComponent implements OnInit, OnDestroy {
  private readonly themeVersion = signal(0);
  private themeObserver: MutationObserver | null = null;

  readonly labels = input.required<readonly string[]>();
  readonly series = input.required<readonly AppBarChartSeries[]>();
  readonly height = input('20rem');
  readonly showLegend = input(true, { transform: booleanAttribute });
  readonly orientation = input<AppBarChartOrientation>('vertical');
  // Backward-compatible alias. Prefer using `orientation`.
  readonly horizontal = input(false, { transform: booleanAttribute });
  readonly cornerRadius = input(6);
  readonly stacked = input(false, { transform: booleanAttribute });
  readonly dimOthersOnFocus = input(false, { transform: booleanAttribute });
  readonly blurOpacity = input(0.2);
  readonly axisPointerType = input<AppBarChartAxisPointerType>('shadow');
  readonly valueAxisPercent = input(false, { transform: booleanAttribute });
  readonly valueAxisCurrencyCode = input<string | null>(null);
  readonly tooltipTrigger = input<AppBarChartTooltipTrigger>('axis');

  protected readonly options = computed<EChartsCoreOption>(() => {
    // Recompute options when document theme classes/attributes change.
    this.themeVersion();
    const { foreground, mutedForeground, border, tooltipBackground, tooltipForeground } = resolveChartSurfaceColors();
    const fontFamily = resolveChartFontFamily();

    const isHorizontal = this.orientation() === 'horizontal' || this.horizontal();
    const useStack = this.stacked();
    const shouldDimOthersOnFocus = this.dimOthersOnFocus();
    const normalizedBlurOpacity = Math.min(Math.max(this.blurOpacity(), 0), 1);
    const normalizedDefaultCornerRadius = Math.max(0, this.cornerRadius());
    const usePercentValueAxis = this.valueAxisPercent();
    const normalizedCurrencyCode = this.normalizeCurrencyCode(this.valueAxisCurrencyCode());
    const currencyFormatter = normalizedCurrencyCode
      ? (value: unknown) => this.formatCurrencyValue(value, normalizedCurrencyCode)
      : null;
    const tooltipTrigger = this.tooltipTrigger();
    const valueAxisLabelFormatter = usePercentValueAxis
      ? (value: number | string) => `${Number.isFinite(Number(value)) ? Number(value) : value}%`
      : currencyFormatter
        ? (value: number | string) => currencyFormatter(value)
      : undefined;
    const axisPointerType = this.axisPointerType();
    const axisPointer =
      axisPointerType === 'shadow'
        ? {
            type: 'shadow' as const,
            shadowStyle: {
              color: mutedForeground,
              opacity: 0.1,
            },
            label: {
              backgroundColor: tooltipBackground,
              borderColor: border,
              borderWidth: 1,
              color: tooltipForeground,
              fontFamily,
              ...(!usePercentValueAxis && currencyFormatter
                ? {
                    formatter: (params: { axisDimension?: string; value?: unknown }) =>
                      params?.axisDimension === 'x' || params?.axisDimension === 'y'
                        ? currencyFormatter(params?.value)
                        : `${params?.value ?? ''}`,
                  }
                : {}),
            },
          }
        : {
            type: axisPointerType,
            label: {
              backgroundColor: tooltipBackground,
              borderColor: border,
              borderWidth: 1,
              color: tooltipForeground,
              fontFamily,
              ...(!usePercentValueAxis && currencyFormatter
                ? {
                    formatter: (params: { axisDimension?: string; value?: unknown }) =>
                      params?.axisDimension === 'x' || params?.axisDimension === 'y'
                        ? currencyFormatter(params?.value)
                        : `${params?.value ?? ''}`,
                  }
                : {}),
            },
          };

    const barSeries = this.series().map((seriesItem, index) => {
      const color = resolveChartSeriesColor({
        color: seriesItem.color,
        themeColor: seriesItem.themeColor,
        index,
      });
      const seriesCornerRadius = Math.max(0, seriesItem.cornerRadius ?? normalizedDefaultCornerRadius);
      const defaultPositiveRadius = isHorizontal
        ? [0, seriesCornerRadius, seriesCornerRadius, 0]
        : [seriesCornerRadius, seriesCornerRadius, 0, 0];
      const defaultNegativeRadius = isHorizontal
        ? [seriesCornerRadius, 0, 0, seriesCornerRadius]
        : [0, 0, seriesCornerRadius, seriesCornerRadius];
      const data = seriesItem.borderRadius !== undefined
        ? seriesItem.data
        : seriesItem.data.map((value) => ({
            value,
            itemStyle: {
              borderRadius: value < 0 ? defaultNegativeRadius : defaultPositiveRadius,
            },
          }));
      const itemStyle = {
        color,
        ...(seriesItem.borderRadius !== undefined ? { borderRadius: seriesItem.borderRadius } : {}),
      };
      const emphasisItemStyle = {
        color,
        opacity: 0.9,
        borderColor: 'transparent',
        borderWidth: 0.5,
      };

      return {
        name: seriesItem.name,
        type: 'bar' as const,
        data,
        stack: seriesItem.stack ?? (useStack ? 'total' : undefined),
        barWidth: seriesItem.barWidth,
        itemStyle,
        emphasis: {
          focus: shouldDimOthersOnFocus ? ('series' as const) : ('none' as const),
          itemStyle: emphasisItemStyle,
        },
        blur: shouldDimOthersOnFocus ? { itemStyle: { color, opacity: normalizedBlurOpacity } } : undefined,
      };
    });

    return {
      textStyle: {
        fontFamily,
      },
      tooltip: {
        trigger: tooltipTrigger,
        backgroundColor: tooltipBackground,
        borderColor: border,
        borderWidth: 1,
        textStyle: {
          color: tooltipForeground,
          fontFamily,
        },
        ...(tooltipTrigger === 'axis' ? { axisPointer } : {}),
        ...(!usePercentValueAxis && currencyFormatter
          ? {
              valueFormatter: (value: unknown) => currencyFormatter(value),
            }
          : {}),
        ...(tooltipTrigger === 'item'
          ? {
              formatter: (params: unknown) => this.formatItemTooltip(params, usePercentValueAxis, currencyFormatter),
            }
          : {}),
      },
      legend: {
        show: this.showLegend() && barSeries.length > 0,
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
      xAxis: isHorizontal
        ? {
            type: 'value',
            axisLabel: {
              color: foreground,
              fontFamily,
              ...(valueAxisLabelFormatter ? { formatter: valueAxisLabelFormatter } : {}),
            },
            splitLine: { lineStyle: { color: border } },
          }
        : {
            type: 'category',
            data: this.labels(),
            axisLabel: {
              color: foreground,
              fontFamily,
            },
            axisLine: { lineStyle: { color: border } },
          },
      yAxis: isHorizontal
        ? {
            type: 'category',
            data: this.labels(),
            axisLabel: {
              color: foreground,
              fontFamily,
            },
            axisLine: { lineStyle: { color: border } },
          }
        : {
            type: 'value',
            axisLabel: {
              color: foreground,
              fontFamily,
              ...(valueAxisLabelFormatter ? { formatter: valueAxisLabelFormatter } : {}),
            },
            splitLine: { lineStyle: { color: border } },
          },
      series: barSeries,
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

  private formatItemTooltip(
    params: unknown,
    usePercentValueAxis: boolean,
    currencyFormatter: ((value: unknown) => string) | null,
  ): string {
    const tooltipParams = params as {
      seriesIndex?: number;
      dataIndex?: number;
      seriesName?: string;
      marker?: string;
      value?: number | string | readonly unknown[];
    };
    const seriesIndex = Number.isInteger(tooltipParams?.seriesIndex) ? Number(tooltipParams.seriesIndex) : -1;
    const dataIndex = Number.isInteger(tooltipParams?.dataIndex) ? Number(tooltipParams.dataIndex) : -1;
    const series = this.series()[seriesIndex];
    const seriesName = typeof series?.name === 'string' ? series.name : (tooltipParams?.seriesName ?? '').toString();
    const marker = typeof tooltipParams?.marker === 'string' ? tooltipParams.marker : '';
    const rawValueCandidate = Array.isArray(tooltipParams?.value) ? tooltipParams.value[0] : tooltipParams?.value;
    const rawValue =
      rawValueCandidate && typeof rawValueCandidate === 'object' && 'value' in rawValueCandidate
        ? (rawValueCandidate as { value?: unknown }).value
        : rawValueCandidate;
    const numericValue = Number(rawValue);
    const percentText =
      usePercentValueAxis && Number.isFinite(numericValue) ? `${numericValue.toFixed(2)}%` : null;
    const labelStyle = 'font-weight: 300; opacity: 0.78;';
    const valueStyle = 'font-weight: 700;';
    const percentStyle = 'font-weight: 400;';
    const formatLabelValue = (label: string, value: string) =>
      `<span style="${labelStyle}">${this.escapeHtml(label)}</span> <strong style="${valueStyle}">${this.escapeHtml(value)}</strong>`;
    const formatDetailLine = (line: string) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex < 0) {
        return `<span style="${labelStyle}">${this.escapeHtml(line)}</span>`;
      }

      const detailLabel = line.slice(0, separatorIndex + 1);
      const detailValue = line.slice(separatorIndex + 1).trim();
      return formatLabelValue(detailLabel, detailValue);
    };
    const shouldHideValue = series?.tooltipHideValue === true;
    const indexedTooltipValueText =
      dataIndex >= 0 && Array.isArray(series?.tooltipValueTextByIndex)
        ? (series.tooltipValueTextByIndex[dataIndex] ?? null)
        : null;
    const valueText = shouldHideValue
      ? null
      : typeof indexedTooltipValueText === 'string' && indexedTooltipValueText.trim().length > 0
        ? indexedTooltipValueText
        : typeof series?.tooltipValueText === 'string' && series.tooltipValueText.trim().length > 0
        ? series.tooltipValueText
        : Number.isFinite(numericValue)
          ? currencyFormatter
            ? currencyFormatter(numericValue)
            : String(numericValue)
          : null;
    const details = (series?.tooltipDetails ?? [])
      .map((line) => formatDetailLine(line))
      .filter((line) => line.length > 0);

    if (series?.tooltipDetailsOnly && details.length > 0) {
      return details.join('<br/>');
    }

    const lines: string[] = [];
    if (seriesName.length > 0 || valueText || percentText) {
      let baseLine = seriesName;
      if (valueText) {
        baseLine = formatLabelValue(seriesName, valueText);
      } else if (seriesName.length > 0) {
        baseLine = `<span style="${labelStyle}">${seriesName}</span>`;
      }

      if (percentText) {
        baseLine = `${baseLine} <span style="${percentStyle}">(${this.escapeHtml(percentText)})</span>`;
      }

      if (baseLine.length > 0) {
        lines.push(marker.length > 0 ? `${marker} ${baseLine}` : baseLine);
      }
    }
    lines.push(...details);

    return lines.join('<br/>');
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

    const normalizedValue = value.trim().toUpperCase();
    return normalizedValue.length > 0 ? normalizedValue : null;
  }

  private formatCurrencyValue(value: unknown, currencyCode: string): string {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return `${value ?? ''}`;
    }

    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currencyCode,
        maximumFractionDigits: 2,
      }).format(numericValue);
    } catch {
      return `${numericValue.toFixed(2)} ${currencyCode}`;
    }
  }
}
