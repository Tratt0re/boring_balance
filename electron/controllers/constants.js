const ALLOWED_ACCOUNT_TYPES = new Set(['cash', 'bank', 'savings', 'brokerage', 'crypto', 'credit']);
const ALLOWED_CATEGORY_TYPES = new Set(['income', 'expense', 'exclude']);

module.exports = {
  ALLOWED_ACCOUNT_TYPES,
  ALLOWED_CATEGORY_TYPES,
};
