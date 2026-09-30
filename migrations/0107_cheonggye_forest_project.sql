CREATE TABLE IF NOT EXISTS local_region_projects (
  region_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  phase TEXT NOT NULL DEFAULT '',
  status_text TEXT NOT NULL DEFAULT '',
  next_step TEXT NOT NULL DEFAULT '',
  public_path TEXT NOT NULL DEFAULT '',
  admin_path TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (region_id, project_id)
);

CREATE TABLE IF NOT EXISTS local_region_project_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  region_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'administration',
  status TEXT NOT NULL DEFAULT 'completed',
  summary TEXT NOT NULL DEFAULT '',
  organizations_json TEXT NOT NULL DEFAULT '[]',
  place TEXT NOT NULL DEFAULT '',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  next_action TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_region_project_records_public
  ON local_region_project_records(region_id, project_id, visibility, occurred_on DESC, id DESC);

CREATE TABLE IF NOT EXISTS local_region_project_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  region_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  record_id INTEGER,
  event_type TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  event_at TEXT NOT NULL
);

INSERT OR IGNORE INTO local_region_projects
(region_id,project_id,name,subtitle,phase,status_text,next_step,public_path,admin_path,created_at,updated_at)
VALUES
('local:cheonggye','forest','청계면 국민의숲','승달산·목포대 지역상생숲',
 '국민의숲 후보지 사전협의','영암국유림관리소에 후보지 검토를 요청하고 회신을 확인하는 단계입니다.',
 '후보지 1~3곳 확인 → 현장답사 → 이용신청',
 '/cheonggye/forest','/cheonggye/admin/forest',
 '2026-09-03T00:00:00.000Z','2026-09-10T00:00:00.000Z');

INSERT INTO local_region_project_records
(region_id,project_id,occurred_on,title,category,status,summary,organizations_json,place,evidence_json,next_action,visibility,created_by,created_at,updated_at)
SELECT
 'local:cheonggye','forest','2026-09-03','국민의숲 기존 사업자료 확보','research','completed',
 '기존 국민의숲 사업계획서, 체험의숲 사업계획서, 이용신청서와 이용승인 공문 사례를 확보했습니다.',
 '["청계면상인회"]','',
 '[{"type":"document","label":"국민의숲 사업계획서·이용신청·승인 사례"}]',
 '청계면·승달산 여건에 맞게 신청자료를 재구성합니다.','public','system',
 '2026-09-03T00:00:00.000Z','2026-09-03T00:00:00.000Z'
WHERE NOT EXISTS (
 SELECT 1 FROM local_region_project_records
 WHERE region_id='local:cheonggye' AND project_id='forest' AND occurred_on='2026-09-03'
   AND title='국민의숲 기존 사업자료 확보'
);

INSERT INTO local_region_project_records
(region_id,project_id,occurred_on,title,category,status,summary,organizations_json,place,evidence_json,next_action,visibility,created_by,created_at,updated_at)
SELECT
 'local:cheonggye','forest','2026-09-10','목포대 후문 인근 국민의숲 후보지 사전협의 요청','administration','completed',
 '목포대 후문 상권과 승달산 산림자원을 연결하는 공익형 산림교육·숲체험 프로젝트를 위해 산림청 소관 국유림 후보지 검토를 요청했습니다.',
 '["청계면상인회","영암국유림관리소"]','무안군 청계면·승달산 권역',
 '[{"type":"email","label":"국민의숲 후보지 사전협의 요청"}]',
 '후보지 1~3곳 회신을 확인하고 현장답사 일정을 협의합니다.','public','system',
 '2026-09-10T00:00:00.000Z','2026-09-10T00:00:00.000Z'
WHERE NOT EXISTS (
 SELECT 1 FROM local_region_project_records
 WHERE region_id='local:cheonggye' AND project_id='forest' AND occurred_on='2026-09-10'
   AND title='목포대 후문 인근 국민의숲 후보지 사전협의 요청'
);

INSERT OR IGNORE INTO local_region_operator_assignments
(region_id,module_id,operator_id,operator_tenant_slug,role,status,effective_from,effective_to,assigned_by,note,created_at,updated_at)
VALUES
('local:cheonggye','forest','cgma','cgma','lead_operator','active','2026-09-23T00:00:00.000Z',NULL,'system','청계면 국민의숲 프로젝트 초기 주 운영권','2026-09-23T00:00:00.000Z','2026-09-23T00:00:00.000Z');

INSERT OR IGNORE INTO local_region_operator_events
(event_key,region_id,module_id,operator_id,event_type,from_role,to_role,actor_email,reason,event_at)
VALUES
('seed:local:cheonggye:forest:cgma','local:cheonggye','forest','cgma','assigned','','lead_operator','system','청계면 국민의숲 프로젝트 초기 주 운영권','2026-09-23T00:00:00.000Z');
