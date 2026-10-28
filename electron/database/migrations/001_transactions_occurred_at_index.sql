-- Date-range queries (overview, analytics, exports) filter and sort transactions by occurred_at only,
-- which the existing (account_id, occurred_at) and (category_id, occurred_at) indexes cannot serve.
-- Keep this statement identical to the one in schemas/003_transactions.sql.
CREATE INDEX IF NOT EXISTS idx_tx_occurred_at ON transactions(occurred_at);
