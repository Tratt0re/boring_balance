CREATE TABLE IF NOT EXISTS budgets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id      INTEGER NOT NULL,

  amount_cents     INTEGER NOT NULL CHECK (amount_cents > 0),
  include_children INTEGER NOT NULL DEFAULT 0 CHECK (include_children IN (0,1)),
  description             TEXT,

  archived         INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  created_at       INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  updated_at       INTEGER,

  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_category_active
ON budgets(category_id)
WHERE archived = 0;

CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category_id);
CREATE INDEX IF NOT EXISTS idx_budgets_archived ON budgets(archived);

CREATE TRIGGER IF NOT EXISTS trg_categories_archive_delete_budgets
AFTER UPDATE OF archived ON categories
FOR EACH ROW
WHEN NEW.archived = 1 AND OLD.archived = 0
BEGIN
  DELETE FROM budgets
  WHERE category_id = NEW.id;
END;
