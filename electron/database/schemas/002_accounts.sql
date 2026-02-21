CREATE TABLE IF NOT EXISTS accounts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL UNIQUE,
  type         TEXT NOT NULL DEFAULT 'bank' CHECK (type IN ('cash','bank','savings','brokerage','crypto','credit')),
  description  TEXT, -- optional
  color_key    TEXT, -- optional
  icon         TEXT, -- optional
  archived     INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  locked       INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0,1)),
  created_at   INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  updated_at   INTEGER
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
CREATE INDEX IF NOT EXISTS idx_accounts_locked ON accounts(locked);
CREATE INDEX IF NOT EXISTS idx_accounts_archived ON accounts(archived);
