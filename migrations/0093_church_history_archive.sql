CREATE TABLE IF NOT EXISTS church_history_entries (
  id TEXT PRIMARY KEY,
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  date_label TEXT NOT NULL DEFAULT '',
  era TEXT NOT NULL DEFAULT '',
  organization TEXT NOT NULL DEFAULT '',
  relation_type TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'milestone',
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  place TEXT NOT NULL DEFAULT '',
  people_text TEXT NOT NULL DEFAULT '',
  source_title TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'document',
  source_ref TEXT NOT NULL DEFAULT '',
  verification_status TEXT NOT NULL DEFAULT 'needs-review',
  verification_note TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private',
  featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_church_history_public_order
  ON church_history_entries (visibility, sort_order, start_date);
CREATE INDEX IF NOT EXISTS idx_church_history_verification
  ON church_history_entries (verification_status, updated_at);

CREATE TABLE IF NOT EXISTS church_history_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_church_history_audit_entry
  ON church_history_audit_logs (entry_id, created_at DESC);

-- Seed only facts that are supported by the reviewed EKODI historical source set.
-- The 2006 item is deliberately marked contextual: employment is evidence of the
-- life setting, not proof that organized foreign-student ministry began then.
INSERT OR IGNORE INTO church_history_entries
(id,start_date,date_label,era,organization,relation_type,kind,title,summary,body_text,place,source_title,source_type,verification_status,verification_note,visibility,featured,sort_order)
VALUES
('mnu-life-context-2006','2006-11-01','2006년 11월부터','삶의 자리','목포대학교','personal-root','context','목포대학교에서 이어진 삶의 자리','목포대학교 언어교육원과 국제교류교육원에서의 근무는 이후 외국인 유학생을 가까이에서 만나게 되는 삶의 배경이 되었습니다.','이 기록은 선교 조직의 시작일을 뜻하지 않습니다. 확인 가능한 개인 경력과 이후 사역의 연결 맥락을 구분하여 보존합니다.','목포대학교','개인이력서정찬균','career-record','contextual','근무 이력은 확인되나 이 시점을 선교 시작일로 단정하지 않음.','public',1,10),
('local-church-foreign-student-2014','2014-09-06','2014년 9월 6일','지역교회에서의 섬김','청계제일교회 선교부','local-church','ministry','지역교회에서 외국인 유학생을 섬기다','청계지역 외국인 유학생을 초청해 한국문화 체험과 돌봄을 나누는 선교 활동이 지역교회 안에서 구체화되었습니다.','2014년 추석 명절 유학생 선교 계획에는 약 50명의 유학생을 대상으로 한 문화체험과 돌봄, 사전 학교 홍보와 후원·기도 계획이 기록되어 있습니다.','무안군 청계면','2014유학생선교계획(추석명절)','ministry-plan','documented','행사계획 원문에서 일시·장소·주관·담당 확인.','public',1,20),
('mnu-cooperative-sports-2015','2015-05-01','2015년 5월부터','대학·지역 협력선교','목포대학교 교수신우회','cooperative-mission','ministry','목포대학교 유학생 체육대회로 협력의 폭을 넓히다','목포대학교 교수신우회를 중심으로 유학생 체육대회가 이어지며 대학과 지역의 외국인 섬김이 협력 사역으로 확장되었습니다.','글로벌비전센터 설립 소개자료는 2015년 5월부터 여러 차례 유학생 체육대회가 진행되었다고 기록합니다.','목포대학교','181125비전센터소개 · 2015목대유학생체육대회계획','ministry-record','documented','월 단위 기록을 기준으로 대표 정렬일을 사용함.','public',0,30),
('chinese-student-worship-2016','2016-09-01','2016년 9월부터','대학·지역 협력선교','목포대학교 교수신우회·지역교회','cooperative-mission','worship','중국 유학생 예배를 함께 세우다','교수신우회와 여러 지역교회가 역할을 나누어 중국 유학생 예배와 교제, 교육 프로그램을 준비하고 운영했습니다.','2016년 준비모임 자료에는 교수신우회가 장소를 제공하고 여러 지역교회가 예배와 프로그램을 담당하는 협력 구조가 기록되어 있습니다.','목포대학교','목대중국유학생예배2016년2학기','worship-record','documented','준비모임과 학기 운영 자료 확인.','public',1,40),
('kfm-muan-ekodi-2018-03-14','2018-03-14','2018년 3월 14일','선교 공동체의 형성','한국외국인선교회 무안지부 · 에코디선교회','organizational-predecessor','organization','한국외국인선교회 무안지부와 에코디선교회','후대 사역소개 문서는 한국외국인선교회 소속 무안지부(에코디선교회)가 목포대학교 대학생과 외국인 유학생을 포함한 지역 선교를 위해 설립되었다고 기록합니다.','이 날짜는 현재 확보된 문서에서 선교조직의 출범 이정표로 보존합니다. 2018년 8월 13일로 기록된 별도의 개척·창립 이력과 합치지 않고 각각의 의미를 검토합니다.','무안군 청계면','211208사역소개및후원요청편지-오룡교회농촌선교팀','ministry-letter','documented','문서에 2018년 03월 14일 설립으로 명시.','public',1,50),
('nepal-vietnam-bible-study-2018','2018-03-01','2018년 1학기부터','대학·지역 협력선교','목포대학교 외국인 유학생 사역','cooperative-mission','bible-study','네팔·베트남 유학생 성경공부가 이어지다','네팔 유학생을 위한 영어 성경공부와 베트남 유학생을 위한 한국어 성경공부가 시작되며 언어와 문화에 맞춘 돌봄이 넓어졌습니다.','2018년 글로벌비전센터 소개문서는 2018년 1학기부터 두 성경공부가 시작되었다고 기록합니다.','목포대학교','181125비전센터소개','ministry-record','documented','학기 단위 기록이며 3월은 정렬을 위한 대표월.','public',0,60),
('community-opening-2018-08-13','2018-08-13','2018년 8월 13일','공동체의 전환점','에코디선교회','community-opening','organization','또 하나의 창립·개척 이정표','2022년 작성된 미션펀드 신청서에는 교회 창립 또는 개척 연도로 2018년 8월 13일이 기록되어 있습니다.','이 날짜의 정확한 조직적 의미는 2018년 3월 14일 기록과 구분하여 보존합니다. 하나를 다른 하나로 덮어쓰지 않고 추가 자료와 구술기록으로 의미를 확정합니다.','무안군 청계면','220901미션펀드신청서MF_Application','application-record','needs-review','날짜 자체는 문서 확인. 3월 14일과의 관계·명칭은 추가 검토 필요.','public',1,70),
('global-vision-center-2018-10-09','2018-10-09','2018년 10월 9일','글로벌비전센터','목포대학교 글로벌비전센터','continuing-ministry','partnership','글로벌비전센터 설립예배','대학과 지역교회가 이어 온 외국인 유학생 사역이 독립된 공간과 협력 네트워크를 얻으며 새로운 기반을 갖추었습니다.','글로벌비전센터는 외국인 유학생의 예배·성경공부·쉼과 교제를 위한 공간으로 세워졌으며, 설립예배 날짜가 2018년 10월 9일로 기록되어 있습니다.','목포대학교 인근','181125비전센터소개','center-record','documented','설립예배 일자와 설립 배경 확인.','public',1,80),
('global-vision-center-network-2019','2019-09-01','2019년','글로벌비전센터','목포대학교 글로벌비전센터','continuing-ministry','partnership','대학·교회·선교단체의 협력 거점으로','글로벌비전센터는 교수·직원신우회, 지역교회, 한국외국인선교회 무안지부 등 여러 주체가 함께하는 유학생 선교 협력 거점으로 운영되었습니다.','2019년 센터 브로셔에는 언어권별 유학생 모임과 한국어교육·성경공부, 협력기관과 단체가 기록되어 있습니다.','목포대학교 인근','190924센터브로셔(안)','center-brochure','documented','2019년 브로셔의 협력기관·프로그램 기록 확인.','public',0,90),
('ekodi-church-continuity-present','2026-06-29','현재','에코디교회','에코디교회 · 에코디선교회 · 글로벌비전센터 사역','church-continuity','church','에코디교회로 이어지는 선교적 공동체','에코디선교회의 말씀·교제·돌봄·지역선교의 흐름은 에코디교회로 이어지고, 목포대학교 글로벌비전센터와의 사역적 연결도 계속됩니다.','현재의 교회는 과거 조직명을 지우지 않고, 한 사람의 부르심과 대학·지역교회·선교단체의 협력이 공동체로 자라온 과정을 함께 기억합니다.','','260629에코디교회기도편지 · 에코디선교회 격월 선교편지','current-ministry-record','documented','현재 교회·선교회 기록을 통해 연속성을 확인. 구체적 명칭 전환일은 별도 확정 필요.','public',1,100);
