-- 사역소식 통합 발행 허브 (ekodi.kr/sosik) — additive only, D1 ekodi-auth.
-- 한 번 기록한 사역소식을 체크해 골라 교회·선교회 후원자, 기도동역자, 외부기관에 보낸다.
-- Church and mission data stay distinguished by org; recipient lists are per group, never mixed.

CREATE TABLE IF NOT EXISTS ministry_news_items (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL CHECK (org IN ('church','mission','shared')),
  kind TEXT NOT NULL DEFAULT 'news' CHECK (kind IN ('news','activity','history','prayer')),
  event_date TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  photos_json TEXT NOT NULL DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'partners' CHECK (visibility IN ('public','partners','report','private')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_ministry_news_items_public ON ministry_news_items (visibility, status, event_date DESC);

CREATE TABLE IF NOT EXISTS ministry_news_groups (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL CHECK (org IN ('church','mission','shared')),
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','web_submit','site')),
  description TEXT NOT NULL DEFAULT '',
  submit_url TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  public_subscribe INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO ministry_news_groups (id, org, name, channel, description, submit_url, public_subscribe, sort_order) VALUES
  ('church-supporters', 'church', '교회 후원자', 'email', '에코디교회 후원자에게 보내는 선교편지', '', 1, 10),
  ('mission-supporters', 'mission', '선교회 후원자', 'email', '에코디선교회 후원자에게 보내는 선교편지', '', 1, 20),
  ('prayer-partners', 'shared', '기도동역자', 'email', '교회·선교회 공동 기도편지', '', 1, 30),
  ('kfm', 'mission', '한국외국인선교회', 'web_submit', '사역보고·기도요청 웹 제출 (제출 주소는 관리화면에서 등록)', '', 0, 40),
  ('missionfund', 'mission', '미션펀드', 'web_submit', '미션펀드 소식지용 사진·기도편지 제출', 'https://missionfund-update.onrender.com/?c=mfchris', 0, 50),
  ('public-site', 'shared', '사이트 공개', 'site', '교회·선교회 사이트와 /sosik 공개 소식', '', 0, 60);

CREATE TABLE IF NOT EXISTS ministry_news_recipients (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  consent_at TEXT NOT NULL DEFAULT '',
  consent_source TEXT NOT NULL DEFAULT '',
  consent_by TEXT NOT NULL DEFAULT '',
  unsubscribed_at TEXT NOT NULL DEFAULT '',
  unsub_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (group_id, email)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ministry_news_recipients_token ON ministry_news_recipients (unsub_token);

CREATE TABLE IF NOT EXISTS ministry_news_dispatches (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL CHECK (org IN ('church','mission')),
  kind TEXT NOT NULL DEFAULT 'letter' CHECK (kind IN ('letter','report','prayer')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  period_label TEXT NOT NULL DEFAULT '',
  item_ids_json TEXT NOT NULL DEFAULT '[]',
  group_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','PARTIAL','SENT')),
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  approved_at TEXT NOT NULL DEFAULT '',
  approved_by TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_ministry_news_dispatches_created ON ministry_news_dispatches (created_at DESC);

CREATE TABLE IF NOT EXISTS ministry_news_deliveries (
  id TEXT PRIMARY KEY,
  dispatch_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('SENDING','SENT','FAILED','SUBMITTED')),
  message_id TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (dispatch_id, recipient_id)
);

CREATE TABLE IF NOT EXISTS ministry_news_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ministry_news_audit_created ON ministry_news_audit_logs (created_at DESC);
