const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;

function normalizePagination(pagination = {}, options = {}) {
  const defaultPage = options.defaultPage ?? DEFAULT_PAGE;
  const defaultPageSize = options.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const page = Number.isInteger(pagination.page) && pagination.page > 0 ? pagination.page : defaultPage;
  const pageSize =
    Number.isInteger(pagination.page_size) && pagination.page_size > 0
      ? pagination.page_size
      : defaultPageSize;

  return {
    page,
    page_size: pageSize,
  };
}

function resolvePaginationWindow(total, pagination = {}, options = {}) {
  const defaultPage = options.defaultPage ?? DEFAULT_PAGE;
  const normalizedPagination = normalizePagination(pagination, options);
  const totalPages =
    total === 0 ? defaultPage : Math.max(defaultPage, Math.ceil(total / normalizedPagination.page_size));
  const page = Math.min(normalizedPagination.page, totalPages);

  return {
    ...normalizedPagination,
    page,
    total_pages: totalPages,
    offset: (page - 1) * normalizedPagination.page_size,
  };
}

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  normalizePagination,
  resolvePaginationWindow,
};
