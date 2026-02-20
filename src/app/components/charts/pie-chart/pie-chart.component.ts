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
  resolveChartCssColor,
  resolveChartFontFamily,
  resolveChartSeriesColor,
  resolveChartSurfaceColors,
  type AppChartThemeColor,
} from '../chart-theme';

export interface AppPieChartItem {
  readonly name: string;
  readonly value: number;
  readonly themeColor?: AppChartThemeColor;
  readonly color?: string;
}

@Component({
  selector: 'app-pie-chart',
  imports: [NgxEchartsDirective],
  templateUrl: './pie-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class AppPieChartComponent implements OnInit, OnDestroy {
  private readonly themeVersion = signal(0);
  private themeObserver: MutationObserver | null = null;

  readonly data = input.required<readonly AppPieChartItem[]>();
  readonly height = input('20rem');
  readonly showLegend = input(true, { transform: booleanAttribute });
  readonly showLabels = input(true, { transform: booleanAttribute });
  readonly donut = input(true, { transform: booleanAttribute });
  readonly dimOthersOnFocus = input(false, { transform: booleanAttribute });
  readonly blurOpacity = input(0.2);
  readonly scaleOnFocus = input(false, { transform: booleanAttribute });
  readonly scaleSize = input(8);

  protected readonly options = computed<EChartsCoreOption>(() => {
    // Recompute options when document theme classes/attributes change.
    this.themeVersion();
    const { foreground, mutedForeground, border, tooltipBackground, tooltipForeground } = resolveChartSurfaceColors();
    const fontFamily = resolveChartFontFamily();
    const showLegend = this.showLegend();
    const showLabels = this.showLabels();
    const shouldDimOthersOnFocus = this.dimOthersOnFocus();
    const normalizedBlurOpacity = Math.min(Math.max(this.blurOpacity(), 0), 1);
    const shouldScaleOnFocus = this.scaleOnFocus();
    const normalizedScaleSize = Math.max(0, this.scaleSize());
    const separatorColor = resolveChartCssColor('--card', '#ffffff');

    const pieData = this.data().map((item, index) => {
      const color = resolveChartSeriesColor({
        color: item.color,
        themeColor: item.themeColor,
        index,
      });

      return {
        name: item.name,
        value: item.value,
        itemStyle: {
          color,
          borderColor: separatorColor,
          borderWidth: 2,
          borderRadius: 10,
        },
        emphasis: {
          itemStyle: {
            color,
            opacity: 1,
            borderColor: separatorColor,
            borderWidth: 2,
            borderRadius: 10,
          },
        },
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
      },
      legend: {
        show: showLegend && pieData.length > 0,
        bottom: 0,
        textStyle: {
          color: foreground,
          fontFamily,
        },
      },
      series: [
        {
          name: 'Pie',
          type: 'pie',
          radius: this.donut() ? ['40%', '70%'] : '70%',
          center: ['50%', showLegend ? '42%' : '50%'],
          avoidLabelOverlap: true,
          minAngle: 2,
          label: {
            show: showLabels,
            color: foreground,
            formatter: '{b}: {d}%',
            fontSize: 12,
            fontFamily,
          },
          labelLine: {
            show: showLabels,
            length: 14,
            length2: 10,
            smooth: 0.2,
            lineStyle: {
              color: mutedForeground,
              width: 1,
            },
          },
          data: pieData,
          emphasis: {
            focus: shouldDimOthersOnFocus ? ('self' as const) : ('none' as const),
            scale: shouldScaleOnFocus,
            scaleSize: shouldScaleOnFocus ? normalizedScaleSize : undefined,
            labelLine: {
              show: showLabels,
              lineStyle: {
                color: mutedForeground,
                width: 1,
              },
            },
          },
          blur: shouldDimOthersOnFocus
            ? {
                itemStyle: { opacity: normalizedBlurOpacity },
                labelLine: {
                  show: showLabels,
                  lineStyle: {
                    color: mutedForeground,
                    width: 1,
                    opacity: normalizedBlurOpacity,
                  },
                },
              }
            : undefined,
        },
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
}
