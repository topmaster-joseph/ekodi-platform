CREATE TABLE IF NOT EXISTS evolution_recommendations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  target TEXT NOT NULL,
  score REAL NOT NULL,
  priority TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence_grade TEXT NOT NULL,
  status TEXT NOT NULL,
  approval_required INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evolution_recommendations_priority
  ON evolution_recommendations(priority, score DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_recommendations_last_seen
  ON evolution_recommendations(last_seen_at DESC);
CREATE TABLE IF NOT EXISTS evolution_evidence (
  recommendation_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  source_type TEXT NOT NULL,
  version TEXT,
  claim TEXT NOT NULL DEFAULT '',
  verified_at TEXT NOT NULL,
  PRIMARY KEY (recommendation_id, url)
);
