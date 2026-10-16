-- Per-member quotas for AI Commons. Providers are never directly exposed to clients.
CREATE TABLE IF NOT EXISTS ai_commons_chat_usage (
  user_id TEXT NOT NULL,
  day_utc TEXT NOT NULL,
  tier TEXT NOT NULL CHECK(tier IN ('free','local','paid')),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count >= 0),
  PRIMARY KEY(user_id,day_utc,tier)
);
