CREATE TABLE IF NOT EXISTS accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT, -- optional
  color_key   TEXT, -- optional
  icon        TEXT, -- optional
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  created_at  INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  updated_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_accounts_archived ON accounts(archived);
