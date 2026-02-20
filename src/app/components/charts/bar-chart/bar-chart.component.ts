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

export interface AppBarChartSeries {
  readonly data: readonly number[];
  readonly name: string;
  readonly stack?: string;
  readonly barWidth?: number | string;
  readonly cornerRadius?: number;
  readonly borderRadius?: number | readonly [number, number, number, number];
  readonly themeColor?: AppChartThemeColor;
  readonly color?: string;
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
        trigger: 'axis',
        backgroundColor: tooltipBackground,
        borderColor: border,
        borderWidth: 1,
        textStyle: {
          color: tooltipForeground,
          fontFamily,
        },
        axisPointer,
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
}
