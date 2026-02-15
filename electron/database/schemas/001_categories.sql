CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  parent_id   INTEGER,

  description TEXT,
  color_key   TEXT,
  icon        TEXT,

  type        TEXT NOT NULL CHECK (type IN ('income','expense','exclude')),
  locked      INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0,1)),
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),

  created_at  INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  updated_at  INTEGER,

  FOREIGN KEY (parent_id) REFERENCES categories(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_parent_name
ON categories(parent_id, name);

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
CREATE INDEX IF NOT EXISTS idx_categories_archived ON categories(archived);

INSERT OR IGNORE INTO categories
(name, parent_id, description, color_key, icon, type, locked, archived)
VALUES
('category.exclude.name', NULL, 'category.exclude.description', 'category-color-11', 'ban', 'exclude', 1, 0),
('category.transfer.name', NULL, 'category.transfer.description', 'category-color-11', 'arrow-left-right', 'exclude', 1, 0),
('category.other_expense.name', NULL, 'category.other_expense.description', 'category-color-11', 'circle', 'expense', 1, 0),
('category.other_income.name', NULL, 'category.other_income.description', 'category-color-11', 'circle-dollar-sign', 'income', 1, 0);
