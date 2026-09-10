-- Control-plane read model for low-cost D1 monitoring queries.
-- Runtime DDL is forbidden: schema ownership stays in migrations.
CREATE TABLE IF NOT EXISTS cloudflare_environment_checks (
  environment TEXT NOT NULL,
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  host TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  response_ms INTEGER,
  detail TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL,
  PRIMARY KEY (environment, service_id)
);

CREATE TABLE IF NOT EXISTS public_site_controls (
  site_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  public_status TEXT NOT NULL DEFAULT 'maintenance',
  maintenance_display_type TEXT NOT NULL DEFAULT 'default',
  maintenance_redirect_url TEXT NOT NULL DEFAULT '',
  maintenance_title TEXT NOT NULL DEFAULT '?꾩옱 ?ъ씠??媛쒕컻以묒엯?덈떎',
  maintenance_message TEXT NOT NULL DEFAULT '??醫뗭? ?쒕퉬?ㅻ줈 以鍮?以묒엯?덈떎.',
  redirect_mode TEXT NOT NULL DEFAULT 'button',
  updated_at TEXT NOT NULL,
  updated_by INTEGER
);
CREATE TABLE IF NOT EXISTS service_check_latest (
  service_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  http_status INTEGER,
  response_ms INTEGER,
  detail TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_service_check_latest_time
  ON service_check_latest(checked_at DESC);

CREATE TABLE IF NOT EXISTS service_check_hourly (
  service_id TEXT NOT NULL,
  bucket_start TEXT NOT NULL,
  checks INTEGER NOT NULL DEFAULT 0,
  online_checks INTEGER NOT NULL DEFAULT 0,
  degraded_checks INTEGER NOT NULL DEFAULT 0,
  offline_checks INTEGER NOT NULL DEFAULT 0,
  response_ms_total INTEGER NOT NULL DEFAULT 0,
  max_response_ms INTEGER,
  PRIMARY KEY (service_id, bucket_start)
);
CREATE INDEX IF NOT EXISTS idx_service_check_hourly_time
  ON service_check_hourly(bucket_start DESC);

-- One-time bounded backfill. Normal reads never scan the 30-day raw log.
INSERT OR REPLACE INTO service_check_latest
  (service_id, status, http_status, response_ms, detail, checked_at)
SELECT c.service_id, c.status, c.http_status, c.response_ms, c.detail, c.checked_at
FROM service_checks c
JOIN (
  SELECT service_id, MAX(id) AS max_id
  FROM service_checks
  GROUP BY service_id
) latest ON latest.max_id = c.id;

INSERT OR REPLACE INTO service_check_hourly
  (service_id, bucket_start, checks, online_checks, degraded_checks, offline_checks, response_ms_total, max_response_ms)
SELECT service_id,
  substr(checked_at, 1, 13) || ':00:00.000Z',
  COUNT(*),
  SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END),
  SUM(CASE WHEN status = 'degraded' THEN 1 ELSE 0 END),
  SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END),
  SUM(COALESCE(response_ms, 0)),
  MAX(response_ms)
FROM service_checks
WHERE checked_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-48 hours')
GROUP BY service_id, substr(checked_at, 1, 13);
