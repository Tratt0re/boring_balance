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
  resolveChartCssColor,
  resolveChartFontFamily,
  resolveChartSeriesColor,
  resolveChartSurfaceColors,
  type AppChartThemeColor,
} from '../chart-theme';

const CHART_LABEL_FONT_SIZE = 12;

export interface AppPieChartItem {
  readonly name: string;
  readonly value: number;
  readonly themeColor?: AppChartThemeColor;
  readonly color?: string;
  readonly tooltipValueText?: string;
  readonly tooltipDetails?: readonly string[];
}

@Component({
  selector: 'app-pie-chart',
  imports: [NgxEchartsDirective],
  templateUrl: './pie-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block min-w-0 w-full max-w-full',
  },
})
export class AppPieChartComponent implements OnInit, OnDestroy {
  private readonly numberFormatService = inject(NumberFormatService);
  private readonly themeVersion = signal(0);
  private themeObserver: MutationObserver | null = null;

  readonly data = input.required<readonly AppPieChartItem[]>();
  readonly height = input('20rem');
  readonly showLegend = input(true, { transform: booleanAttribute });
  readonly showLabels = input(true, { transform: booleanAttribute });
  readonly labelFormat = input<'namePercent' | 'percentOnly'>('namePercent');
  readonly legendPosition = input<'bottom' | 'right'>('bottom');
  readonly smartPercentLabels = input(false, { transform: booleanAttribute });
  readonly insideLabelMinPercent = input(10);
  readonly donut = input(true, { transform: booleanAttribute });
  readonly radiusScale = input(1);
  readonly dimOthersOnFocus = input(false, { transform: booleanAttribute });
  readonly blurOpacity = input(0.2);
  readonly scaleOnFocus = input(false, { transform: booleanAttribute });
  readonly scaleSize = input(8);
  readonly tooltipShowPercentage = input(true, { transform: booleanAttribute });

  protected readonly options = computed<EChartsCoreOption>(() => {
    // Recompute options when document theme classes/attributes change.
    this.themeVersion();
    this.numberFormatService.currencyFormatStyle();
    const { foreground, mutedForeground, border, tooltipBackground, tooltipForeground } = resolveChartSurfaceColors();
    const fontFamily = resolveChartFontFamily();
    const showLegend = this.showLegend();
    const useRightLegend = showLegend && this.legendPosition() === 'right';
    const showLabels = this.showLabels();
    const labelFormatter = this.labelFormat() === 'percentOnly' ? '{d}%' : '{b}: {d}%';
    const smartPercentLabels = this.smartPercentLabels() && this.labelFormat() === 'percentOnly';
    const insideLabelMinPercent = Math.max(0, Number(this.insideLabelMinPercent()) || 0);
    const normalizedRadiusScale = Math.max(0.5, Number(this.radiusScale()) || 1);
    const shouldDimOthersOnFocus = this.dimOthersOnFocus();
    const normalizedBlurOpacity = Math.min(Math.max(this.blurOpacity(), 0), 1);
    const shouldScaleOnFocus = this.scaleOnFocus();
    const normalizedScaleSize = Math.max(0, this.scaleSize());
    const tooltipShowPercentage = this.tooltipShowPercentage();
    const separatorColor = resolveChartCssColor('--card', resolveChartCssColor('--background', '#ffffff'));
    const labelStyle = 'font-weight: 300; opacity: 0.78;';
    const valueStyle = 'font-weight: 700;';
    const escapeHtml = (value: unknown): string =>
      `${value ?? ''}`
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    const formatTooltipLabelValue = (label: string, value: string) =>
      `<span style="${labelStyle}">${escapeHtml(label)}</span> <strong style="${valueStyle}">${escapeHtml(value)}</strong>`;
    const formatTooltipDetailLine = (line: string) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex < 0) {
        return `<span style="${labelStyle}">${escapeHtml(line)}</span>`;
      }

      const detailLabel = line.slice(0, separatorIndex + 1);
      const detailValue = line.slice(separatorIndex + 1).trim();
      return formatTooltipLabelValue(detailLabel, detailValue);
    };

    const totalValue = this.data().reduce((sum, item) => {
      const value = Number(item.value ?? 0);
      return sum + (Number.isFinite(value) && value > 0 ? value : 0);
    }, 0);

    const pieData = this.data().map((item, index) => {
      const color = resolveChartSeriesColor({
        color: item.color,
        themeColor: item.themeColor,
        index,
      });
      const numericValue = Number(item.value ?? 0);
      const percent = totalValue > 0 && Number.isFinite(numericValue) ? (numericValue / totalValue) * 100 : 0;
      const useOutsideLabel = smartPercentLabels && percent < insideLabelMinPercent;
      const itemLabel =
        smartPercentLabels && showLabels
          ? {
              show: true,
              position: useOutsideLabel ? ('outside' as const) : ('inside' as const),
              color: useOutsideLabel ? foreground : resolveChartCssColor('--primary-foreground', '#ffffff'),
              formatter: labelFormatter,
              fontSize: CHART_LABEL_FONT_SIZE,
              fontFamily,
              fontWeight: useOutsideLabel ? 400 : 600,
              textShadowColor: useOutsideLabel ? 'transparent' : 'rgba(0,0,0,0.28)',
              textShadowBlur: useOutsideLabel ? 0 : 2,
            }
          : undefined;
      const itemLabelLine =
        smartPercentLabels && showLabels
          ? {
              show: useOutsideLabel,
              length: 14,
              length2: 10,
              smooth: 0.2,
              lineStyle: {
                color: mutedForeground,
                width: 1,
              },
            }
          : undefined;

      return {
        name: item.name,
        value: item.value,
        tooltipValueText: item.tooltipValueText,
        tooltipDetails: item.tooltipDetails,
        ...(itemLabel ? { label: itemLabel } : {}),
        ...(itemLabelLine ? { labelLine: itemLabelLine } : {}),
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
    const scalePercent = (value: number, max = 90): string => `${Math.min(max, Math.max(0, value * normalizedRadiusScale))}%`;
    const pieRadius = useRightLegend
      ? this.donut()
        ? ([scalePercent(34), scalePercent(58, 72)] as const)
        : scalePercent(58, 72)
      : this.donut()
        ? ([scalePercent(40), scalePercent(70, 82)] as const)
        : scalePercent(70, 82);

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
        formatter: (params: {
          marker?: string;
          name?: string;
          value?: unknown;
          percent?: number;
          data?: { tooltipDetails?: readonly string[]; tooltipValueText?: string };
        }) => {
          const marker = params?.marker ?? '';
          const name = params?.name ?? '';
          const rawValue = Number(params?.value ?? 0);
          const customTooltipValueText = params?.data?.tooltipValueText;
          const formattedValue =
            typeof customTooltipValueText === 'string' && customTooltipValueText.trim().length > 0
              ? customTooltipValueText
              : Number.isFinite(rawValue)
                ? this.numberFormatService.formatNumber(rawValue)
                : `${params?.value ?? ''}`;
          const percent = Number(params?.percent ?? 0);
          const details = Array.isArray(params?.data?.tooltipDetails) ? params.data.tooltipDetails : [];
          const baseWithoutPercent = `${marker}${formatTooltipLabelValue(`${name}:`, formattedValue)}`;

          if (!tooltipShowPercentage) {
            const formattedDetails = details.map((line) => formatTooltipDetailLine(line)).join('<br/>');
            return details.length === 0 ? baseWithoutPercent : `${baseWithoutPercent}<br/>${formattedDetails}`;
          }

          const baseWithPercent =
            `${baseWithoutPercent} <span style="${labelStyle}">(` +
            `${escapeHtml(this.numberFormatService.formatPercent(percent, { maximumFractionDigits: 2 }))})</span>`;
          const formattedDetails = details.map((line) => formatTooltipDetailLine(line)).join('<br/>');
          return details.length === 0 ? baseWithPercent : `${baseWithPercent}<br/>${formattedDetails}`;
        },
      },
      legend: {
        show: showLegend && pieData.length > 0,
        ...(useRightLegend
          ? {
              orient: 'vertical' as const,
              right: 0,
              top: 'middle' as const,
            }
          : {
              bottom: 0,
            }),
        textStyle: {
          color: foreground,
          fontFamily,
        },
      },
      series: [
        {
          name: 'Pie',
          type: 'pie',
          radius: pieRadius,
          center: useRightLegend ? ['30%', '50%'] : ['50%', showLegend ? '42%' : '50%'],
          avoidLabelOverlap: true,
          minAngle: 2,
          label: {
            show: showLabels,
            color: foreground,
            formatter: labelFormatter,
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
          labelLayout: {
            hideOverlap: true,
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
