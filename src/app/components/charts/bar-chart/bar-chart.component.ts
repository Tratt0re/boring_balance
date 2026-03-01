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
  readonly dataColors?: readonly string[];
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
  private readonly numberFormatService = inject(NumberFormatService);
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
  readonly showAxisTooltipDelta = input(false, { transform: booleanAttribute });
  readonly axisTooltipDeltaLabel = input('Delta');
  readonly axisTooltipDetailsByIndex = input<readonly (readonly string[] | undefined)[]>([]);

  protected readonly options = computed<EChartsCoreOption>(() => {
    // Recompute options when document theme classes/attributes change.
    this.themeVersion();
    this.numberFormatService.currencyFormatStyle();
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
    const showAxisTooltipDelta = this.showAxisTooltipDelta();
    const axisTooltipDeltaLabel = this.axisTooltipDeltaLabel();
    const valueAxisLabelFormatter = usePercentValueAxis
      ? (value: number | string) =>
          Number.isFinite(Number(value))
            ? this.numberFormatService.formatPercent(Number(value))
            : `${value}%`
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
      const applyDefaultCornerRadius = seriesItem.borderRadius === undefined;
      const hasPerDataColors = (seriesItem.dataColors ?? []).some((candidate) => candidate.trim().length > 0);
      const data = seriesItem.data.map((value, dataIndex) => {
        const dataColor = this.resolveSeriesDataPointColor(seriesItem.dataColors?.[dataIndex], index);
        if (!applyDefaultCornerRadius && !dataColor) {
          return value;
        }

        return {
          value,
          itemStyle: {
            ...(applyDefaultCornerRadius
              ? { borderRadius: value < 0 ? defaultNegativeRadius : defaultPositiveRadius }
              : {}),
            ...(dataColor ? { color: dataColor } : {}),
          },
        };
      });
      const itemStyle = {
        color,
        ...(seriesItem.borderRadius !== undefined ? { borderRadius: seriesItem.borderRadius } : {}),
      };
      const emphasisItemStyle = {
        ...(hasPerDataColors ? {} : { color }),
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
        blur: shouldDimOthersOnFocus
          ? {
              itemStyle: {
                ...(hasPerDataColors ? {} : { color }),
                opacity: normalizedBlurOpacity,
              },
            }
          : undefined,
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
        ...(tooltipTrigger === 'axis' && showAxisTooltipDelta
          ? {
              formatter: (params: unknown) =>
                this.formatAxisTooltip(params, usePercentValueAxis, currencyFormatter, axisTooltipDeltaLabel),
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
      usePercentValueAxis && Number.isFinite(numericValue)
        ? this.numberFormatService.formatPercent(numericValue, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : null;
    const labelStyle = 'font-weight: 300; opacity: 0.78;';
    const valueStyle = 'font-weight: 700;';
    const percentStyle = 'font-weight: 400;';
    const formatLabelValue = (label: string, value: string) =>
      `<span style="${labelStyle}">${this.escapeHtml(label)}</span> <strong style="${valueStyle}">${this.escapeHtml(value)}</strong>`;
    const formatDetailLine = (line: string) =>
      this.formatTooltipDetailLine(line, labelStyle, formatLabelValue);
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

  private formatAxisTooltip(
    params: unknown,
    usePercentValueAxis: boolean,
    currencyFormatter: ((value: unknown) => string) | null,
    deltaLabel: string,
  ): string {
    const tooltipParams = (Array.isArray(params) ? params : []) as Array<{
      axisValueLabel?: unknown;
      axisValue?: unknown;
      seriesName?: unknown;
      marker?: unknown;
      value?: unknown;
      data?: unknown;
    }>;
    if (tooltipParams.length === 0) {
      return '';
    }

    const titleStyle = 'font-weight: 700;';
    const labelStyle = 'font-weight: 300; opacity: 0.78;';
    const valueStyle = 'font-weight: 700;';
    const lines: string[] = [];
    const axisLabelCandidate = tooltipParams.find((entry) => entry?.axisValueLabel !== undefined);
    const axisLabel = String(axisLabelCandidate?.axisValueLabel ?? tooltipParams[0]?.axisValue ?? '');
    const numericSeriesValues: number[] = [];
    const rawDataIndex = tooltipParams
      .map((entry) => Number((entry as { dataIndex?: unknown })?.dataIndex))
      .find((index) => Number.isInteger(index) && index >= 0);
    const dataIndex = Number.isInteger(rawDataIndex) ? Number(rawDataIndex) : -1;

    if (axisLabel.trim().length > 0) {
      lines.push(`<span style="${titleStyle}">${this.escapeHtml(axisLabel)}</span>`);
    }

    for (const entry of tooltipParams) {
      const seriesName = String(entry?.seriesName ?? '');
      const marker = typeof entry?.marker === 'string' ? entry.marker : '';
      const rawValue = this.extractTooltipAxisValue(entry?.value ?? entry?.data);
      const numericValue = Number(rawValue);
      const formattedValue = Number.isFinite(numericValue)
        ? usePercentValueAxis
          ? this.numberFormatService.formatPercent(numericValue, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : currencyFormatter
            ? currencyFormatter(numericValue)
            : String(numericValue)
        : `${rawValue ?? ''}`;

      if (Number.isFinite(numericValue)) {
        numericSeriesValues.push(numericValue);
      }

      const baseLine =
        `<span style="${labelStyle}">${this.escapeHtml(seriesName)}:</span> ` +
        `<strong style="${valueStyle}">${this.escapeHtml(formattedValue)}</strong>`;
      lines.push(marker.length > 0 ? `${marker} ${baseLine}` : baseLine);
    }

    if (numericSeriesValues.length >= 2) {
      const deltaValue = numericSeriesValues[0] - numericSeriesValues[1];
      const formattedDelta = usePercentValueAxis
        ? this.numberFormatService.formatPercent(deltaValue, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : currencyFormatter
          ? currencyFormatter(deltaValue)
          : String(deltaValue);
      lines.push(
        `<span style="${labelStyle}">${this.escapeHtml(deltaLabel)}:</span> ` +
          `<strong style="${valueStyle}">${this.escapeHtml(formattedDelta)}</strong>`,
      );
    }

    const axisTooltipDetailsByIndex = this.axisTooltipDetailsByIndex();
    if (dataIndex >= 0 && dataIndex < axisTooltipDetailsByIndex.length) {
      const details = axisTooltipDetailsByIndex[dataIndex] ?? [];
      const formatLabelValue = (label: string, value: string) =>
        `<span style="${labelStyle}">${this.escapeHtml(label)}</span> ` +
        `<strong style="${valueStyle}">${this.escapeHtml(value)}</strong>`;

      for (const detailLine of details) {
        const formattedLine = this.formatTooltipDetailLine(detailLine, labelStyle, formatLabelValue);
        if (formattedLine.length > 0) {
          lines.push(formattedLine);
        }
      }
    }

    return lines.join('<br/>');
  }

  private extractTooltipAxisValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return this.extractTooltipAxisValue(value[0]);
    }

    if (value && typeof value === 'object' && 'value' in (value as object)) {
      return (value as { value?: unknown }).value;
    }

    return value;
  }

  private resolveSeriesDataPointColor(value: string | undefined, seriesIndex: number): string | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }

    return resolveChartSeriesColor({
      index: seriesIndex,
      color: value,
    });
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private formatTooltipDetailLine(
    line: string,
    labelStyle: string,
    formatLabelValue: (label: string, value: string) => string,
  ): string {
    const normalizedLine = `${line ?? ''}`.trim();
    if (normalizedLine.length === 0) {
      return '';
    }

    const separatorIndex = normalizedLine.indexOf(':');
    if (separatorIndex < 0) {
      return `<span style="${labelStyle}">${this.escapeHtml(normalizedLine)}</span>`;
    }

    const detailLabel = normalizedLine.slice(0, separatorIndex + 1);
    const detailValue = normalizedLine.slice(separatorIndex + 1).trim();
    return formatLabelValue(detailLabel, detailValue);
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
