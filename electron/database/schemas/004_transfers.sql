CREATE TABLE IF NOT EXISTS transfers (
  id              TEXT PRIMARY KEY, -- your current transfer_id
  from_account_id INTEGER NOT NULL,
  to_account_id   INTEGER NOT NULL,
  occurred_at     INTEGER NOT NULL,
  amount_cents    INTEGER NOT NULL CHECK (amount_cents > 0),
  description     TEXT,
  created_at      INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  updated_at      INTEGER,

  settled    INTEGER NOT NULL DEFAULT 1 CHECK (settled IN (0,1)),

  FOREIGN KEY (from_account_id) REFERENCES accounts(id),
  FOREIGN KEY (to_account_id)   REFERENCES accounts(id),

  CHECK (from_account_id <> to_account_id)
);

CREATE INDEX IF NOT EXISTS idx_transfers_occurred_at ON transfers(occurred_at);
CREATE INDEX IF NOT EXISTS idx_transfers_from_account_id ON transfers(from_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_account_id ON transfers(to_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_settled ON transfers(settled);
