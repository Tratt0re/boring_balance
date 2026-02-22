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
import { TranslateService } from '@ngx-translate/core';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { Subscription } from 'rxjs';

import {
  observeChartThemeChanges,
  resolveChartFontFamily,
  resolveChartSeriesColor,
  resolveChartSurfaceColors,
  type AppChartThemeColor,
} from '../chart-theme';

export interface AppCalendarChartItem {
  readonly date: string;
  readonly value: number;
}

export type AppCalendarChartRange = string | readonly [string, string];
export type AppCalendarChartOrientation = 'horizontal' | 'vertical';
export type AppCalendarChartVariant = 'heatmap' | 'points' | 'waves';

const CALENDAR_CELL_SIZE: readonly [number, number] = [10, 10];
const CALENDAR_DENSE_CELL_SIZE: readonly [number, number] = [7, 7];
const CALENDAR_THEME_COLOR_DEFAULT: AppChartThemeColor = 'chart-1';

@Component({
  selector: 'app-calendar-chart',
  imports: [NgxEchartsDirective],
  templateUrl: './calendar-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class AppCalendarChartComponent implements OnInit, OnDestroy {
  private readonly translateService = inject(TranslateService);
  private readonly themeVersion = signal(0);
  private themeObserver: MutationObserver | null = null;
  private languageChangeSubscription: Subscription | null = null;

  readonly data = input.required<readonly AppCalendarChartItem[]>();
  readonly height = input('16rem');
  readonly showVisualMap = input(true, { transform: booleanAttribute });
  readonly orientation = input<AppCalendarChartOrientation>('horizontal');
  readonly showYearLabel = input(true, { transform: booleanAttribute });
  readonly range = input<AppCalendarChartRange | null>(null);
  readonly minValue = input<number | null>(null);
  readonly maxValue = input<number | null>(null);
  readonly themeColor = input<AppChartThemeColor>(CALENDAR_THEME_COLOR_DEFAULT);
  readonly colorStops = input<readonly string[] | null>(null);
  readonly variant = input<AppCalendarChartVariant>('heatmap');
  readonly pointScale = input(1);
  // Backward-compatible override. If set, applies only to `waves`.
  readonly wavePointScale = input(1.45);

  protected readonly options = computed<EChartsCoreOption>(() => {
    // Recompute options when document theme classes/attributes change.
    this.themeVersion();
    const { background, foreground, mutedForeground, border, tooltipBackground, tooltipForeground } = resolveChartSurfaceColors();
    const fontFamily = resolveChartFontFamily();
    const tooltipFontFamily = this.escapeHtml(fontFamily);
    const points = this.data();
    const calendarData = points.map((item) => [item.date, item.value] as const);
    const values = points.map((item) => item.value);
    const autoMin = values.length > 0 ? Math.min(...values) : 0;
    const autoMax = values.length > 0 ? Math.max(...values) : 0;

    const rawMin = this.minValue() ?? autoMin;
    const rawMax = this.maxValue() ?? autoMax;
    const visualMin = Math.min(rawMin, rawMax);
    const visualMax = Math.max(rawMin, rawMax);
    const normalizedVisualMax = visualMax === visualMin ? visualMax + 1 : visualMax;
    const orientation = this.orientation();
    const isVertical = orientation === 'vertical';
    const showVisualMap = this.showVisualMap();
    const showYearLabel = this.showYearLabel();
    const variant = this.variant();
    const normalizedPointScale = Math.max(0.2, this.pointScale());
    const normalizedWavePointScale = Math.max(0.2, this.wavePointScale());
    const locale = this.resolveLocale();
    const localizedWeekdayNameMap = this.resolveWeekdayNameMap(locale);
    const localizedMonthNameMap = this.resolveMonthNameMap(locale);

    const calendarRange = this.range() ?? this.resolveRangeFromData(points);
    const displayedYear = this.resolveDisplayedYear(calendarRange);
    const gradientStops = this.colorStops();
    const baseScaleColor = resolveChartSeriesColor({
      index: 0,
      themeColor: this.themeColor(),
    });
    const lowScaleColor = this.mixRgbColors(background, baseScaleColor, 0.45);
    const defaultScaleStops = [lowScaleColor, baseScaleColor] as const;
    const visualInRange = gradientStops && gradientStops.length > 0
      ? {
          color: gradientStops,
        }
      : {
          color: defaultScaleStops,
        };
    const calendarLayout = isVertical
      ? {
          top: showYearLabel ? 72 : 28,
          left: 'center' as const,
          width: showVisualMap ? '72%' : '80%',
          height: '68%',
        }
      : {
          top: showYearLabel ? 72 : 28,
          left: 'center' as const,
          width: '90%',
          height: showVisualMap ? '70%' : '80%',
        };
    const visualMapLayout = isVertical
      ? {
          orient: 'vertical' as const,
          right: 8,
          top: 'middle' as const,
          align: 'right' as const,
          itemWidth: 12,
          itemHeight: 72,
          textGap: 6,
        }
      : {
          orient: 'horizontal' as const,
          left: 'center' as const,
          bottom: 0,
        };

    return {
      textStyle: {
        fontFamily,
      },
      graphic: showYearLabel
        ? [
            {
              type: 'text',
              right: isVertical ? (showVisualMap ? 44 : 16) : 16,
              top: 8,
              z: 10,
              silent: true,
              style: {
                text: displayedYear,
                fill: foreground,
                font: `700 20px ${fontFamily}`,
                textAlign: 'right',
              },
            },
          ]
        : undefined,
      tooltip: {
        trigger: 'item',
        position: 'top',
        backgroundColor: tooltipBackground,
        borderColor: border,
        borderWidth: 1,
        textStyle: {
          color: tooltipForeground,
          fontFamily,
        },
        formatter: (params: { data?: readonly [string, number] }) => {
          const date = params.data?.[0] ?? '';
          const value = params.data?.[1] ?? 0;
          const safeDate = this.escapeHtml(this.formatCalendarTooltipDate(String(date), locale));
          return (
            `<span style="font-family:${tooltipFontFamily};color:${mutedForeground};font-weight:400;">${safeDate}</span>: ` +
            `<strong style="font-family:${tooltipFontFamily};color:${tooltipForeground};font-weight:700;">${value}</strong>`
          );
        },
      },
      visualMap: showVisualMap
        ? {
            dimension: 1,
            min: visualMin,
            max: normalizedVisualMax,
            ...visualMapLayout,
            calculable: true,
            inRange: visualInRange,
            textStyle: {
              color: foreground,
              fontFamily,
            },
          }
        : undefined,
      calendar: {
        ...calendarLayout,
        orient: orientation,
        cellSize: CALENDAR_CELL_SIZE,
        range: calendarRange,
        splitLine: {
          show: true,
          lineStyle: {
            color: border,
            width: 1,
          },
        },
        itemStyle: {
          color: background,
          borderWidth: 1,
          borderColor: border,
        },
        dayLabel: {
          color: foreground,
          firstDay: 1,
          nameMap: localizedWeekdayNameMap,
          formatter: (value: unknown) => this.formatCalendarWeekdayLabel(value, locale, localizedWeekdayNameMap),
          margin: 10,
          fontFamily,
        },
        monthLabel: {
          color: foreground,
          position: isVertical ? 'start' : undefined,
          nameMap: localizedMonthNameMap,
          formatter: (value: unknown) => this.formatCalendarMonthLabel(value, locale, localizedMonthNameMap),
          margin: 12,
          fontFamily,
        },
        yearLabel: {
          show: false,
          color: foreground,
          margin: 34,
          position: 'top',
          fontFamily,
        },
      },
      series: [
        variant === 'points'
          ? {
              type: 'scatter',
              coordinateSystem: 'calendar',
              encode: {
                value: 1,
              },
              data: calendarData,
              symbolSize: (value: unknown) =>
                this.resolvePointSize(value, visualMin, normalizedVisualMax, normalizedPointScale),
              itemStyle: {
                opacity: 0.92,
              },
              emphasis: {
                itemStyle: {
                  borderColor: foreground,
                  borderWidth: 1,
                },
              },
            }
          : variant === 'waves'
            ? {
                type: 'effectScatter',
                coordinateSystem: 'calendar',
                encode: {
                  value: 1,
                },
                data: calendarData,
                symbolSize: (value: unknown) =>
                  this.resolvePointSize(
                    value,
                    visualMin,
                    normalizedVisualMax,
                    normalizedPointScale * normalizedWavePointScale,
                  ),
                itemStyle: {
                  opacity: 0.92,
                },
                rippleEffect: {
                  scale: 2.5,
                  period: 3,
                  brushType: 'stroke',
                },
                emphasis: {
                  itemStyle: {
                    borderColor: foreground,
                    borderWidth: 1,
                  },
                },
              }
            : {
                type: 'heatmap',
                coordinateSystem: 'calendar',
                encode: {
                  value: 1,
                },
                data: calendarData,
                emphasis: {
                  itemStyle: {
                    borderColor: foreground,
                    borderWidth: 1,
                  },
                },
              },
      ],
    };
  });

  ngOnInit(): void {
    this.themeObserver = observeChartThemeChanges(() => {
      this.themeVersion.update((currentVersion) => currentVersion + 1);
    });
    this.languageChangeSubscription = this.translateService.onLangChange.subscribe(() => {
      this.themeVersion.update((currentVersion) => currentVersion + 1);
    });
  }

  ngOnDestroy(): void {
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    this.languageChangeSubscription?.unsubscribe();
    this.languageChangeSubscription = null;
  }

  private resolveRangeFromData(points: readonly AppCalendarChartItem[]): AppCalendarChartRange {
    if (points.length === 0) {
      return `${new Date().getFullYear()}`;
    }

    let minDate = points[0].date;
    let maxDate = points[0].date;
    for (const point of points) {
      if (point.date < minDate) {
        minDate = point.date;
      }
      if (point.date > maxDate) {
        maxDate = point.date;
      }
    }

    return minDate === maxDate ? minDate : [minDate, maxDate];
  }

  private resolveDisplayedYear(range: AppCalendarChartRange): string {
    const raw = Array.isArray(range) ? range[0] : range;
    const yearMatch = raw.match(/^(\d{4})/);
    return yearMatch?.[1] ?? `${new Date().getFullYear()}`;
  }

  private resolvePointSize(value: unknown, min: number, max: number, scale = 1): number {
    const numericValue = this.readNumericCalendarValue(value);
    const safeRange = Math.max(1, max - min);
    const ratio = Math.min(Math.max((numericValue - min) / safeRange, 0), 1);
    const [baseWidth, baseHeight] = CALENDAR_DENSE_CELL_SIZE;
    const baseSize = Math.max(4, Math.min(baseWidth, baseHeight) - 2) + ratio * 6;
    return baseSize * scale;
  }

  private readNumericCalendarValue(value: unknown): number {
    if (Array.isArray(value)) {
      const maybeValue = Number(value[1]);
      return Number.isFinite(maybeValue) ? maybeValue : 0;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private resolveLocale(): string | undefined {
    const currentLanguage = this.translateService.getCurrentLang();
    return typeof currentLanguage === 'string' && currentLanguage.trim().length > 0
      ? currentLanguage
      : undefined;
  }

  private resolveWeekdayNameMap(locale?: string): readonly string[] {
    try {
      const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
      return Array.from({ length: 7 }, (_value, index) => formatter.format(new Date(2023, 0, 1 + index, 12)));
    } catch {
      return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    }
  }

  private resolveMonthNameMap(locale?: string): readonly string[] {
    try {
      const formatter = new Intl.DateTimeFormat(locale, { month: 'short' });
      return Array.from({ length: 12 }, (_value, index) => formatter.format(new Date(2023, index, 1, 12)));
    } catch {
      return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }
  }

  private formatCalendarTooltipDate(rawDate: string, locale?: string): string {
    if (!rawDate) {
      return rawDate;
    }

    try {
      const dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const parsedDate = dateMatch
        ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), 12)
        : new Date(rawDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return rawDate;
      }

      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(parsedDate);
    } catch {
      return rawDate;
    }
  }

  private formatCalendarWeekdayLabel(
    rawValue: unknown,
    locale: string | undefined,
    localizedSundayFirst: readonly string[],
  ): string {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      const index = ((Math.round(rawValue) % 7) + 7) % 7;
      return localizedSundayFirst[index] ?? `${rawValue}`;
    }

    const text = `${rawValue ?? ''}`.trim();
    if (!text) {
      return text;
    }

    const directEnglishMatch = this.resolveEnglishWeekdayIndex(text);
    if (directEnglishMatch !== null) {
      return localizedSundayFirst[directEnglishMatch] ?? text;
    }

    // If ECharts already applied `nameMap`, keep the provided localized value.
    return text;
  }

  private formatCalendarMonthLabel(
    rawValue: unknown,
    _locale: string | undefined,
    localizedMonths: readonly string[],
  ): string {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      const index = ((Math.round(rawValue) % 12) + 12) % 12;
      return localizedMonths[index] ?? `${rawValue}`;
    }

    const text = `${rawValue ?? ''}`.trim();
    if (!text) {
      return text;
    }

    const directEnglishMatch = this.resolveEnglishMonthIndex(text);
    if (directEnglishMatch !== null) {
      return localizedMonths[directEnglishMatch] ?? text;
    }

    return text;
  }

  private resolveEnglishWeekdayIndex(value: string): number | null {
    const normalized = value.toLowerCase();
    const englishLong = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const englishShort = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const englishNarrow = ['s', 'm', 't', 'w', 't', 'f', 's'];

    const longIndex = englishLong.indexOf(normalized);
    if (longIndex >= 0) {
      return longIndex;
    }

    const shortIndex = englishShort.indexOf(normalized);
    if (shortIndex >= 0) {
      return shortIndex;
    }

    if (normalized.length === 1) {
      // Ambiguous for Tuesday/Thursday and Sunday/Saturday, so avoid guessing.
      return null;
    }

    const narrowIndex = englishNarrow.indexOf(normalized);
    return narrowIndex >= 0 ? narrowIndex : null;
  }

  private resolveEnglishMonthIndex(value: string): number | null {
    const normalized = value.toLowerCase().replace(/\./g, '');
    const englishLong = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ];
    const englishShort = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

    const longIndex = englishLong.indexOf(normalized);
    if (longIndex >= 0) {
      return longIndex;
    }

    const shortIndex = englishShort.indexOf(normalized);
    return shortIndex >= 0 ? shortIndex : null;
  }

  private mixRgbColors(colorA: string, colorB: string, colorBRatio: number): string {
    const rgbA = this.parseRgbColor(colorA);
    const rgbB = this.parseRgbColor(colorB);
    if (!rgbA || !rgbB) {
      return colorB;
    }

    const ratio = Math.min(Math.max(colorBRatio, 0), 1);
    const inverseRatio = 1 - ratio;
    const red = Math.round(rgbA[0] * inverseRatio + rgbB[0] * ratio);
    const green = Math.round(rgbA[1] * inverseRatio + rgbB[1] * ratio);
    const blue = Math.round(rgbA[2] * inverseRatio + rgbB[2] * ratio);
    return `rgb(${red}, ${green}, ${blue})`;
  }

  private parseRgbColor(color: string): readonly [number, number, number] | null {
    const matched = color.match(/rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)/i);
    if (!matched) {
      return null;
    }

    return [Number(matched[1]), Number(matched[2]), Number(matched[3])] as const;
  }
}
