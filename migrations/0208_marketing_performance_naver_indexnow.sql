-- EKODI AI Social Growth Phase 8 — 성과 측정 · 수익 귀속 · 네이버(수동 게시 캡처 · IndexNow).
-- 순수 추가(additive) 마이그레이션이다. 기존 게시·귀속 의미를 바꾸지 않는다.
-- 1) marketing_content_variants: 콘텐츠 제작비(기본 0, 추후 편집) · 수동 게시 URL(네이버 블로그 등) · 게시 시각.
-- 2) marketing_scheduler_state: Control API 10분 cron 안에서 도는 주기 작업(성과 수집 6시간, IndexNow 일 1회)의
--    마지막 실행·성공 시각. 분 단위 cron 틱이 건너뛰어져도 상태 기반으로 다시 실행된다.
-- 3) marketing_metrics_backoff: 채널(연결)별 공급자 rate limit 백오프. 한도에 걸린 채널만 쉬고 나머지는 계속 수집한다.
-- 4) marketing_indexnow_url_state: IndexNow로 마지막에 성공 제출한 URL별 지문(fingerprint). 바뀐 URL만 다시 제출한다.

ALTER TABLE marketing_content_variants ADD COLUMN content_cost_krw INTEGER NOT NULL DEFAULT 0 CHECK(content_cost_krw >= 0);
ALTER TABLE marketing_content_variants ADD COLUMN external_post_url TEXT NOT NULL DEFAULT '';
ALTER TABLE marketing_content_variants ADD COLUMN published_at TEXT;

CREATE TABLE IF NOT EXISTS marketing_scheduler_state (
  task_key TEXT PRIMARY KEY,
  last_started_at TEXT,
  last_success_at TEXT,
  last_status TEXT NOT NULL DEFAULT '',
  detail_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS marketing_metrics_backoff (
  channel_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0 CHECK(failures >= 0),
  retry_after TEXT NOT NULL,
  last_error TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS marketing_indexnow_url_state (
  url TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_post_metrics_job_date
  ON marketing_post_metrics(job_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_traffic_attributions_event
  ON marketing_traffic_attributions(event_type, occurred_at);
