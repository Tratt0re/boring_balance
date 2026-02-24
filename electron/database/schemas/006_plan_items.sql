CREATE TABLE IF NOT EXISTS plan_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,

  title            TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('transaction','transfer')),

  -- Template values (what will be copied into generated items)
  template_json    TEXT NOT NULL,  -- e.g. {"amount_cents":2000,"category_id":7,"account_id":2,"description":"Salary"}
                                  -- or {"amount_cents":1000,"from_account_id":2,"to_account_id":5,"description":"Savings"}

  -- Generation rule (how dates are generated)
  rule_json        TEXT NOT NULL,  -- e.g. {"start_date":..., "count":12, "frequency":{"unit":"month","interval":1}, "month_policy":"clip"}

  created_at   INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  updated_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_plan_items_type       ON plan_items(type);
CREATE INDEX IF NOT EXISTS idx_plan_items_created_at ON plan_items(created_at);
