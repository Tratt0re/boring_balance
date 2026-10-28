import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildDateRangeFilter } = require('../../electron/models/query-utils.js');
const modelPagination = require('../../electron/models/pagination.js');
const controllerUtils = require('../../electron/controllers/utils.js');

describe('buildDateRangeFilter', () => {
  it('returns undefined when no bound is given', () => {
    expect(buildDateRangeFilter(undefined, undefined)).toBeUndefined();
    expect(buildDateRangeFilter()).toBeUndefined();
  });

  it('builds gte, lte or both', () => {
    expect(buildDateRangeFilter(10, undefined)).toEqual({ gte: 10 });
    expect(buildDateRangeFilter(undefined, 20)).toEqual({ lte: 20 });
    expect(buildDateRangeFilter(10, 20)).toEqual({ gte: 10, lte: 20 });
  });

  it('treats 0 as a real bound but null as one too', () => {
    expect(buildDateRangeFilter(0, 0)).toEqual({ gte: 0, lte: 0 });
    // null is not undefined, so it is passed on and later rejected by buildWhereClause.
    expect(buildDateRangeFilter(null, undefined)).toEqual({ gte: null });
  });
});

describe('models/pagination', () => {
  const { normalizePagination, resolvePaginationWindow } = modelPagination;

  it('normalizePagination falls back to defaults for invalid values', () => {
    expect(normalizePagination()).toEqual({ page: 1, page_size: 10 });
    expect(normalizePagination({ page: 0, page_size: -5 })).toEqual({ page: 1, page_size: 10 });
    expect(normalizePagination({ page: 1.5, page_size: '20' })).toEqual({ page: 1, page_size: 10 });
    expect(normalizePagination({ page: 3, page_size: 25 })).toEqual({ page: 3, page_size: 25 });
  });

  it('normalizePagination honours custom defaults', () => {
    expect(normalizePagination({}, { defaultPage: 2, defaultPageSize: 50 })).toEqual({
      page: 2,
      page_size: 50,
    });
  });

  it('resolvePaginationWindow clamps to the last page and computes the offset', () => {
    expect(resolvePaginationWindow(25, { page: 9, page_size: 10 })).toEqual({
      page: 3,
      page_size: 10,
      total_pages: 3,
      offset: 20,
    });
    expect(resolvePaginationWindow(0, { page: 4, page_size: 10 })).toEqual({
      page: 1,
      page_size: 10,
      total_pages: 1,
      offset: 0,
    });
  });
});

// The same window logic exists in controllers/utils.js and models/pagination.js (PLAN 6.6).
// Keep them in lockstep until they are merged.
describe('window logic stays identical in controllers/utils and models/pagination', () => {
  const inputs = [];
  for (const total of [0, 1, 9, 10, 11, 25, 30, 101]) {
    for (const page of [-1, 0, 1, 2, 3, 4, 99, 1.5, undefined]) {
      for (const page_size of [-1, 0, 1, 10, 25, 1.5, undefined]) {
        inputs.push([total, { page, page_size }]);
      }
    }
  }

  it('agrees on every combination', () => {
    for (const [total, pagination] of inputs) {
      const fromModel = modelPagination.resolvePaginationWindow(total, pagination);
      const fromController = controllerUtils.resolvePaginationWindow(total, pagination);
      expect(fromController, JSON.stringify({ total, pagination })).toEqual(fromModel);
    }
  });
});
