-- Internal meeting minutes with share-gated viewer acknowledgement.
CREATE TABLE IF NOT EXISTS seonammedi_minutes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  share_token TEXT NOT NULL UNIQUE,
  meeting_at TEXT NOT NULL,
  title TEXT NOT NULL,
  attendees TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'closed',
  show_viewers INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seonammedi_minutes_token ON seonammedi_minutes(share_token,status);
CREATE TABLE IF NOT EXISTS seonammedi_minute_viewers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  minute_id INTEGER NOT NULL,
  viewer_name TEXT NOT NULL,
  viewed_at TEXT NOT NULL,
  FOREIGN KEY(minute_id) REFERENCES seonammedi_minutes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_seonammedi_minute_viewers_minute ON seonammedi_minute_viewers(minute_id,viewed_at,id);
