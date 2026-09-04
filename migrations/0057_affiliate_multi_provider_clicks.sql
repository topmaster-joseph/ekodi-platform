CREATE TABLE IF NOT EXISTS affiliate_link_clicks (
  link_id INTEGER NOT NULL,
  click_date TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(link_id, click_date)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_link_clicks_date
  ON affiliate_link_clicks(click_date DESC, link_id);
