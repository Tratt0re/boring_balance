CREATE TABLE IF NOT EXISTS account_valuations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    INTEGER NOT NULL,
  valued_at     INTEGER NOT NULL, -- unix ms
  value_cents   INTEGER NOT NULL, -- total market value (cash + holdings)
  source        TEXT,             -- 'manual', 'api', 'import'
  created_at    INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  updated_at    INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_valuations_account_date
ON account_valuations(account_id, valued_at);

CREATE INDEX IF NOT EXISTS idx_account_valuations_account_date
ON account_valuations(account_id, valued_at);
