/**
 * Builds a range filter object for a date/timestamp column.
 *
 * @param {number|undefined} date_from - Inclusive lower bound (gte).
 * @param {number|undefined} date_to - Inclusive upper bound (lte).
 * @returns {{ gte?: number, lte?: number }|undefined} Filter object, or undefined if no bounds given.
 */
function buildDateRangeFilter(date_from, date_to) {
  const filter = {};

  if (date_from !== undefined) {
    filter.gte = date_from;
  }

  if (date_to !== undefined) {
    filter.lte = date_to;
  }

  return Object.keys(filter).length === 0 ? undefined : filter;
}

module.exports = {
  buildDateRangeFilter,
};
