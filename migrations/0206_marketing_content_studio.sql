-- EKODI AI Social Growth Phase 2 — 콘텐츠 스튜디오(채널별 변형·검수), 게시 성과, 유입 귀속.
-- 순수 추가(additive) 마이그레이션이다. 기존 자동 게시(marketing_publication_jobs) 의미는 바꾸지 않는다.
-- 1) marketing_content_variants: 하나의 콘텐츠 → 채널별 변형. 사람·AI 모두 pending_review로 시작하고
--    관리자 승인(approved) 뒤에만 게시 작업(marketing_publication_jobs)을 만들 수 있다.
-- 2) marketing_post_metrics: 게시물별 일자 성과(공급자 API·Metricool·수기 입력).
-- 3) marketing_traffic_attributions: tracking_code(utm_content) 기반 방문·상품조회·제휴클릭·주문 귀속.
-- 4) marketing_publication_jobs에 variant_id / tracking_code 열을 추가하고, 같은 변형이 두 번 예약되지 않도록
--    부분 유일 인덱스로 멱등성을 보장한다(기존 행은 variant_id가 NULL이라 영향 없음).

CREATE TABLE IF NOT EXISTS marketing_content_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  campaign_id INTEGER,
  channel TEXT NOT NULL
    CHECK(channel IN ('facebook','instagram','threads','youtube','naver_blog','other')),
  format TEXT NOT NULL DEFAULT 'feed'
    CHECK(format IN ('feed','photo','carousel','reel','short','video','story','blog_draft')),
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  hashtags_json TEXT NOT NULL DEFAULT '[]',
  media_json TEXT NOT NULL DEFAULT '[]',
  link_url TEXT NOT NULL DEFAULT '',
  tracking_code TEXT NOT NULL UNIQUE,
  disclosure_text TEXT NOT NULL DEFAULT '',
  ai_generated INTEGER NOT NULL DEFAULT 0 CHECK(ai_generated IN (0,1)),
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK(status IN ('draft','pending_review','approved','rejected','scheduled','published','archived')),
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT,
  created_by TEXT NOT NULL DEFAULT '',
  workspace_id TEXT NOT NULL DEFAULT '',
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant','store')),
  subject_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(content_id) REFERENCES marketing_content_items(id)
);
CREATE INDEX IF NOT EXISTS idx_marketing_content_variants_status
  ON marketing_content_variants(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_content_variants_content
  ON marketing_content_variants(content_id);

CREATE TABLE IF NOT EXISTS marketing_post_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  variant_id INTEGER,
  channel TEXT NOT NULL DEFAULT '',
  external_post_id TEXT NOT NULL DEFAULT '',
  metric_date TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0 CHECK(views >= 0),
  reach INTEGER NOT NULL DEFAULT 0 CHECK(reach >= 0),
  likes INTEGER NOT NULL DEFAULT 0 CHECK(likes >= 0),
  comments INTEGER NOT NULL DEFAULT 0 CHECK(comments >= 0),
  shares INTEGER NOT NULL DEFAULT 0 CHECK(shares >= 0),
  saves INTEGER NOT NULL DEFAULT 0 CHECK(saves >= 0),
  clicks INTEGER NOT NULL DEFAULT 0 CHECK(clicks >= 0),
  video_views INTEGER NOT NULL DEFAULT 0 CHECK(video_views >= 0),
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('provider_api','metricool','manual')),
  raw_json TEXT NOT NULL DEFAULT '{}',
  collected_at TEXT NOT NULL,
  UNIQUE(job_id, metric_date, source),
  FOREIGN KEY(job_id) REFERENCES marketing_publication_jobs(id),
  FOREIGN KEY(variant_id) REFERENCES marketing_content_variants(id)
);
CREATE INDEX IF NOT EXISTS idx_marketing_post_metrics_variant
  ON marketing_post_metrics(variant_id, metric_date);

CREATE TABLE IF NOT EXISTS marketing_traffic_attributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_code TEXT NOT NULL,
  job_id INTEGER,
  variant_id INTEGER,
  campaign_id INTEGER,
  channel TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL
    CHECK(event_type IN ('visit','product_view','affiliate_click','order','affiliate_conversion')),
  external_ref TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL UNIQUE,
  value_krw INTEGER NOT NULL DEFAULT 0 CHECK(value_krw >= 0),
  revenue_status TEXT NOT NULL DEFAULT 'none' CHECK(revenue_status IN ('none','estimated','confirmed')),
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES marketing_publication_jobs(id),
  FOREIGN KEY(variant_id) REFERENCES marketing_content_variants(id)
);
CREATE INDEX IF NOT EXISTS idx_marketing_traffic_attributions_code
  ON marketing_traffic_attributions(tracking_code, occurred_at);

ALTER TABLE marketing_publication_jobs ADD COLUMN variant_id INTEGER;
ALTER TABLE marketing_publication_jobs ADD COLUMN tracking_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_publication_jobs_variant_once
  ON marketing_publication_jobs(variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_publication_jobs_tracking_code
  ON marketing_publication_jobs(tracking_code) WHERE tracking_code IS NOT NULL;
