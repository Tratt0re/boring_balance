export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

/**
 * Computes the total number of pages, always at least 1.
 */
export function computePageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * Returns the target page number after creating a new item,
 * jumping to the last page that would contain it.
 */
export function getTargetPageAfterCreate(currentTotal: number, pageSize: number): number {
  const nextTotal = currentTotal + 1;
  return Math.max(1, Math.ceil(nextTotal / pageSize));
}

/**
 * Returns the target page number after deleting an item,
 * clamping to the new last page if the current page no longer exists.
 */
export function getTargetPageAfterDelete(
  currentTotal: number,
  currentPage: number,
  pageSize: number,
): number {
  const nextTotal = Math.max(0, currentTotal - 1);
  const maxPage = Math.max(1, Math.ceil(Math.max(1, nextTotal) / pageSize));
  return Math.min(currentPage, maxPage);
}
