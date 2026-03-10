export const APP_CHART_PALETTE_COLOR_TOKENS = [
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'chart-6',
  'chart-7',
  'chart-8',
] as const;

export const APP_CHART_SEMANTIC_COLOR_TOKENS = [
  'chart-income',
  'chart-expense',
  'chart-net-cashflow',
  'chart-prior-balance',
] as const;

export const APP_CHART_THEME_COLOR_TOKENS = [
  ...APP_CHART_PALETTE_COLOR_TOKENS,
  ...APP_CHART_SEMANTIC_COLOR_TOKENS,
] as const;

export type AppChartThemeColor = (typeof APP_CHART_THEME_COLOR_TOKENS)[number];

const APP_CHART_FALLBACK_COLORS: Record<AppChartThemeColor, string> = {
  'chart-1': 'oklch(0.66 0.23 25)',
  'chart-2': 'oklch(0.74 0.2 55)',
  'chart-3': 'oklch(0.84 0.17 95)',
  'chart-4': 'oklch(0.78 0.19 145)',
  'chart-5': 'oklch(0.73 0.16 195)',
  'chart-6': 'oklch(0.69 0.17 235)',
  'chart-7': 'oklch(0.66 0.18 275)',
  'chart-8': 'oklch(0.69 0.2 320)',
  'chart-income': 'oklch(0.72 0.18 260)',
  'chart-expense': 'oklch(0.72 0.18 25)',
  'chart-net-cashflow': 'oklch(0.72 0.18 305)',
  'chart-prior-balance': 'oklch(0.72 0.18 85)',
} as const;

const DEFAULT_MUTED_FOREGROUND = 'oklch(0.556 0 0)';
const DEFAULT_FOREGROUND = 'oklch(0.145 0 0)';
const DEFAULT_BORDER = 'oklch(0.922 0 0)';
const DEFAULT_BACKGROUND = 'oklch(1 0 0)';
const DEFAULT_FONT_FAMILY = 'Manrope, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

let chartColorContext: CanvasRenderingContext2D | null | undefined;
const normalizedColorCache = new Map<string, string | null>();

export interface AppChartSurfaceColors {
  readonly background: string;
  readonly border: string;
  readonly foreground: string;
  readonly mutedForeground: string;
  readonly tooltipBackground: string;
  readonly tooltipForeground: string;
}

export function resolveChartSurfaceColors(): AppChartSurfaceColors {
  return {
    background: normalizeChartColor(
      readChartCssVariable('--card', readChartCssVariable('--background', DEFAULT_BACKGROUND)),
      DEFAULT_BACKGROUND,
    ),
    foreground: normalizeChartColor(
      readChartCssVariable('--card-foreground', readChartCssVariable('--foreground', DEFAULT_FOREGROUND)),
      DEFAULT_FOREGROUND,
    ),
    mutedForeground: normalizeChartColor(
      readChartCssVariable('--muted-foreground', DEFAULT_MUTED_FOREGROUND),
      DEFAULT_MUTED_FOREGROUND,
    ),
    border: normalizeChartColor(readChartCssVariable('--border', DEFAULT_BORDER), DEFAULT_BORDER),
    tooltipBackground: normalizeChartColor(
      readChartCssVariable('--popover', readChartCssVariable('--card', readChartCssVariable('--background', DEFAULT_BACKGROUND))),
      DEFAULT_BACKGROUND,
    ),
    tooltipForeground: normalizeChartColor(
      readChartCssVariable(
        '--popover-foreground',
        readChartCssVariable('--card-foreground', readChartCssVariable('--foreground', DEFAULT_FOREGROUND)),
      ),
      DEFAULT_FOREGROUND,
    ),
  };
}

export interface ResolveChartSeriesColorOptions {
  readonly index: number;
  readonly color?: string;
  readonly themeColor?: AppChartThemeColor;
}

export function resolveChartSeriesColor(options: ResolveChartSeriesColorOptions): string {
  const fallbackToken = APP_CHART_PALETTE_COLOR_TOKENS[options.index % APP_CHART_PALETTE_COLOR_TOKENS.length];
  const fallbackColor = APP_CHART_FALLBACK_COLORS[fallbackToken];

  if (options.color) {
    return normalizeChartColor(options.color, fallbackColor);
  }

  const themeColor = options.themeColor ?? fallbackToken;
  const colorFromTheme = readChartCssVariable(`--${themeColor}`, APP_CHART_FALLBACK_COLORS[themeColor]);
  return normalizeChartColor(colorFromTheme, APP_CHART_FALLBACK_COLORS[themeColor]);
}

export function resolveChartCssColor(variableName: string, fallback: string): string {
  return normalizeChartColor(readChartCssVariable(variableName, fallback), fallback);
}

export function resolveChartFontFamily(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_FONT_FAMILY;
  }

  const rootStyles = window.getComputedStyle(document.documentElement);
  const fromChartToken = rootStyles.getPropertyValue('--font-chart').trim();
  if (fromChartToken.length > 0) {
    return fromChartToken;
  }

  const fromThemeToken = rootStyles.getPropertyValue('--font-sans').trim();
  if (fromThemeToken.length > 0) {
    return fromThemeToken;
  }

  const bodyElement = document.body;
  if (bodyElement) {
    const fromBodyStyle = window.getComputedStyle(bodyElement).fontFamily.trim();
    if (fromBodyStyle.length > 0) {
      return fromBodyStyle;
    }
  }

  const fromRootStyle = rootStyles.fontFamily.trim();
  return fromRootStyle.length > 0 ? fromRootStyle : DEFAULT_FONT_FAMILY;
}

export function resolveChartTooltipFontFamily(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_FONT_FAMILY;
  }

  const rootStyles = window.getComputedStyle(document.documentElement);
  const fromTooltipToken = rootStyles.getPropertyValue('--font-chart-tooltip').trim();
  if (fromTooltipToken.length > 0) {
    return fromTooltipToken;
  }

  return resolveChartFontFamily();
}

export function observeChartThemeChanges(onChange: () => void): MutationObserver | null {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') {
    return null;
  }

  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  });
  return observer;
}

function readChartCssVariable(variableName: string, fallback: string): string {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const value = window.getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value.length > 0 ? value : fallback;
}

function normalizeChartColor(color: string, fallback: string): string {
  const context = getChartColorContext();
  if (!context) {
    return fallback;
  }

  const resolvedFallback = resolveChartColorReference(fallback, fallback);
  const resolvedColor = resolveChartColorReference(color, resolvedFallback);
  const normalizedFallback = toEchartsColor(context, resolvedFallback);
  const normalizedColor = toEchartsColor(context, resolvedColor);
  return normalizedColor ?? normalizedFallback ?? resolvedFallback ?? fallback;
}

function toEchartsColor(context: CanvasRenderingContext2D, color: string): string | null {
  const cached = normalizedColorCache.get(color);
  if (cached !== undefined) {
    return cached;
  }

  const sentinel = 'rgba(1, 2, 3, 0.5)';

  context.fillStyle = sentinel;
  context.fillStyle = color;
  const applied = context.fillStyle;
  if (applied === sentinel && color.trim().toLowerCase() !== sentinel) {
    normalizedColorCache.set(color, null);
    return null;
  }

  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  const pixel = context.getImageData(0, 0, 1, 1).data;
  const alpha = pixel[3] / 255;

  if (alpha >= 1) {
    const normalized = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
    normalizedColorCache.set(color, normalized);
    return normalized;
  }

  const normalizedAlpha = Number(alpha.toFixed(3));
  const normalized = `rgba(${pixel[0]}, ${pixel[1]}, ${pixel[2]}, ${normalizedAlpha})`;
  normalizedColorCache.set(color, normalized);
  return normalized;
}

function getChartColorContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') {
    return null;
  }

  if (chartColorContext !== undefined) {
    return chartColorContext;
  }

  const canvas = document.createElement('canvas');
  chartColorContext = canvas.getContext('2d', { willReadFrequently: true }) ?? canvas.getContext('2d');
  return chartColorContext;
}

function resolveChartColorReference(color: string, fallback: string): string {
  const trimmedColor = color.trim();
  const variableReferenceMatch = trimmedColor.match(/^var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*(.+))?\)$/);
  if (!variableReferenceMatch) {
    return trimmedColor;
  }

  const variableName = variableReferenceMatch[1];
  const fallbackExpression = variableReferenceMatch[2]?.trim();
  const resolvedFallback = fallbackExpression ? resolveChartColorReference(fallbackExpression, fallback) : fallback;
  return readChartCssVariable(variableName, resolvedFallback);
}
