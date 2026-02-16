CREATE TABLE IF NOT EXISTS transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id   INTEGER NOT NULL,
  category_id  INTEGER NOT NULL,

  occurred_at  INTEGER NOT NULL,

  amount_cents INTEGER NOT NULL, -- signed
  description  TEXT,
  tags         TEXT, -- JSON array

  transfer_id  TEXT, -- NULL for normal tx, same value for transfer legs

  settled    INTEGER NOT NULL DEFAULT 0 CHECK (settled IN (0,1)),
  created_at   INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  updated_at   INTEGER,

  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(account_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_tx_category_date ON transactions(category_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_tx_transfer_id ON transactions(transfer_id);
