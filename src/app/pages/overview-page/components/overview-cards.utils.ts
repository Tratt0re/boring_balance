import { resolveChartCssColor } from '@/components/charts';
import { DEFAULT_VISUAL_COLOR_KEY } from '@/config/visual-options.config';

const AMOUNT_CENTS_DIVISOR = 100;

export const NET_WORTH_PIE_OTHERS_THRESHOLD = 0.1;
export const MONEY_FLOW_EXPENSE_CATEGORY_GROUP_THRESHOLD = 0.04;

export function formatMonthLabel(monthKey: string, locale?: string): string {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number.parseInt(yearText ?? '', 10);
  const month = Number.parseInt(monthText ?? '', 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return monthKey;
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: '2-digit',
  }).format(new Date(year, month - 1, 1));
}

export function toAmount(amountCents: number): number {
  return amountCents / AMOUNT_CENTS_DIVISOR;
}

export function toAbsoluteAmount(amountCents: number): number {
  return Math.abs(amountCents) / AMOUNT_CENTS_DIVISOR;
}

export function toPercent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return (part / total) * 100;
}

export function toMonthRangeTimestamps(year: number, monthIndex: number): { from: number; to: number } {
  const from = new Date(year, monthIndex, 1, 0, 0, 0, 0).getTime();
  const to = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999).getTime();
  return { from, to };
}

export function toYearRangeTimestamps(year: number): { from: number; to: number } {
  const from = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
  const to = new Date(year, 11, 31, 23, 59, 59, 999).getTime();
  return { from, to };
}

export function resolveVisualColorHex(colorKey: string | null | undefined): string {
  const fallbackColor = resolveChartCssColor(`--${DEFAULT_VISUAL_COLOR_KEY}`, resolveChartCssColor('--muted-foreground', '#9ca3af'));
  if (typeof colorKey !== 'string' || colorKey.trim().length === 0) {
    return fallbackColor;
  }

  return resolveChartCssColor(`--${colorKey}`, fallbackColor);
}

export function allocateBucketsToTargetTotalCents<TBucket extends { readonly totalCents: number }>(
  buckets: readonly TBucket[],
  targetTotalCents: number,
): Array<TBucket & { totalCents: number }> {
  const normalizedTarget = Math.max(0, Math.round(Number(targetTotalCents)));
  if (normalizedTarget <= 0 || buckets.length === 0) {
    return [];
  }

  const positiveBuckets = buckets.filter((bucket) => Number(bucket.totalCents) > 0);
  if (positiveBuckets.length === 0) {
    return [];
  }

  const rawTotal = positiveBuckets.reduce((sum, bucket) => sum + Math.max(0, Number(bucket.totalCents)), 0);
  if (rawTotal <= 0) {
    return [];
  }

  const allocations = positiveBuckets.map((bucket, index) => {
    const rawValue = Math.max(0, Number(bucket.totalCents));
    const scaledValue = (rawValue * normalizedTarget) / rawTotal;
    const flooredValue = Math.floor(scaledValue);

    return {
      bucket,
      index,
      totalCents: flooredValue,
      fractional: scaledValue - flooredValue,
    };
  });

  let remaining = normalizedTarget - allocations.reduce((sum, entry) => sum + entry.totalCents, 0);
  if (remaining > 0) {
    allocations
      .slice()
      .sort((left, right) => {
        const fractionComparison = right.fractional - left.fractional;
        if (fractionComparison !== 0) {
          return fractionComparison;
        }

        return left.index - right.index;
      })
      .slice(0, remaining)
      .forEach((entry) => {
        entry.totalCents += 1;
      });
  }

  return allocations
    .map((entry) => ({
      ...entry.bucket,
      totalCents: entry.totalCents,
    }))
    .filter((entry) => entry.totalCents > 0);
}

export function groupMoneyFlowExpenseCategoriesByThreshold(
  categories: ReadonlyArray<{ categoryId: number | null; categoryName: string; totalCents: number }>,
  expensesTotalCents: number,
  otherLabel: string,
): Array<{
  categoryId: number | null;
  categoryName: string;
  totalCents: number;
  tooltipDetails?: readonly { categoryName: string; totalCents: number }[];
}> {
  const normalizedExpensesTotalCents = Math.max(0, Number(expensesTotalCents));
  if (normalizedExpensesTotalCents <= 0 || categories.length === 0) {
    return [];
  }

  const majorCategories: Array<{ categoryId: number | null; categoryName: string; totalCents: number }> = [];
  const minorCategories: Array<{ categoryId: number | null; categoryName: string; totalCents: number }> = [];

  for (const category of categories) {
    const totalCents = Math.max(0, Number(category.totalCents));
    if (totalCents <= 0) {
      continue;
    }

    if (totalCents / normalizedExpensesTotalCents >= MONEY_FLOW_EXPENSE_CATEGORY_GROUP_THRESHOLD) {
      majorCategories.push({ categoryId: category.categoryId, categoryName: category.categoryName, totalCents });
      continue;
    }

    minorCategories.push({ categoryId: category.categoryId, categoryName: category.categoryName, totalCents });
  }

  if (minorCategories.length === 0) {
    return majorCategories;
  }

  const othersTotalCents = minorCategories.reduce((total, category) => total + category.totalCents, 0);
  if (othersTotalCents <= 0) {
    return majorCategories;
  }

  return [
    ...majorCategories,
    {
      categoryId: null,
      categoryName: otherLabel,
      totalCents: othersTotalCents,
      tooltipDetails: minorCategories
        .slice()
        .sort((left, right) => right.totalCents - left.totalCents || left.categoryName.localeCompare(right.categoryName)),
    },
  ];
}
