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

export type AppSankeyChartOrientation = 'horizontal' | 'vertical';
export type AppSankeyChartNodeAlign = 'justify' | 'left' | 'right';

export interface AppSankeyChartNode {
  readonly name: string;
  readonly value?: number;
  readonly color?: string;
  readonly themeColor?: AppChartThemeColor;
}

export interface AppSankeyChartLink {
  readonly source: string;
  readonly target: string;
  readonly value: number;
  readonly color?: string;
  readonly opacity?: number;
}

@Component({
  selector: 'app-sankey-chart',
  imports: [NgxEchartsDirective],
  templateUrl: './sankey-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class AppSankeyChartComponent implements OnInit, OnDestroy {
  private readonly themeVersion = signal(0);
  private themeObserver: MutationObserver | null = null;

  readonly nodes = input.required<readonly AppSankeyChartNode[]>();
  readonly links = input.required<readonly AppSankeyChartLink[]>();
  readonly height = input('20rem');
  readonly showLabels = input(true, { transform: booleanAttribute });
  readonly orientation = input<AppSankeyChartOrientation>('horizontal');
  readonly nodeAlign = input<AppSankeyChartNodeAlign>('justify');
  readonly nodeWidth = input(16);
  readonly nodeGap = input(10);
  readonly lineOpacity = input(0.32);
  readonly curveness = input(0.5);
  readonly layoutIterations = input(32);
  readonly dimOthersOnFocus = input(false, { transform: booleanAttribute });
  readonly blurOpacity = input(0.2);

  protected readonly options = computed<EChartsCoreOption>(() => {
    // Recompute options when document theme classes/attributes change.
    this.themeVersion();
    const { foreground, mutedForeground, border, tooltipBackground, tooltipForeground } = resolveChartSurfaceColors();
    const fontFamily = resolveChartFontFamily();
    const normalizedLineOpacity = Math.min(Math.max(this.lineOpacity(), 0), 1);
    const normalizedBlurOpacity = Math.min(Math.max(this.blurOpacity(), 0), 1);
    const shouldDimOthersOnFocus = this.dimOthersOnFocus();

    const sankeyNodes = this.nodes().map((node, index) => ({
      name: node.name,
      value: node.value,
      itemStyle: {
        color: resolveChartSeriesColor({
          index,
          color: node.color,
          themeColor: node.themeColor,
        }),
      },
    }));

    const sankeyLinks = this.links().map((link) => ({
      source: link.source,
      target: link.target,
      value: link.value,
      lineStyle: {
        color: link.color,
        opacity: Math.min(Math.max(link.opacity ?? normalizedLineOpacity, 0), 1),
      },
    }));

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
      series: [
        {
          type: 'sankey',
          orient: this.orientation(),
          nodeAlign: this.nodeAlign(),
          nodeWidth: Math.max(8, this.nodeWidth()),
          nodeGap: Math.max(2, this.nodeGap()),
          layoutIterations: Math.max(0, Math.round(this.layoutIterations())),
          draggable: false,
          emphasis: {
            focus: shouldDimOthersOnFocus ? ('adjacency' as const) : ('none' as const),
          },
          blur: shouldDimOthersOnFocus
            ? {
                itemStyle: {
                  opacity: normalizedBlurOpacity,
                },
                lineStyle: {
                  opacity: normalizedLineOpacity * normalizedBlurOpacity,
                },
                label: {
                  opacity: normalizedBlurOpacity,
                },
              }
            : undefined,
          lineStyle: {
            color: 'source',
            curveness: Math.min(Math.max(this.curveness(), 0), 1),
            opacity: normalizedLineOpacity,
          },
          itemStyle: {
            borderColor: border,
            borderWidth: 1,
            opacity: 1,
          },
          label: {
            show: this.showLabels(),
            color: foreground,
            fontFamily,
          },
          edgeLabel: {
            show: false,
            color: mutedForeground,
            fontFamily,
          },
          data: sankeyNodes,
          links: sankeyLinks,
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
