CREATE TABLE IF NOT EXISTS books_publications (
  id TEXT PRIMARY KEY,
  catalog_no TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  series TEXT NOT NULL DEFAULT 'EKODI ORIGINAL',
  series_number INTEGER,
  publication_type TEXT NOT NULL DEFAULT 'MONOGRAPH',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  stage TEXT NOT NULL DEFAULT 'MANUSCRIPT',
  editorial_field TEXT NOT NULL DEFAULT 'Ecclesia',
  language_label TEXT NOT NULL DEFAULT '한국어',
  format_json TEXT NOT NULL DEFAULT '["EPUB 3"]',
  edition TEXT NOT NULL DEFAULT '',
  abstract TEXT NOT NULL DEFAULT '',
  citation TEXT NOT NULL DEFAULT '',
  cover_image TEXT NOT NULL DEFAULT '',
  detail_url TEXT NOT NULL DEFAULT '',
  google_books_id TEXT NOT NULL DEFAULT '',
  isbn_ebook TEXT NOT NULL DEFAULT '',
  amazon_asin TEXT NOT NULL DEFAULT '',
  distribution_json TEXT NOT NULL DEFAULT '{}',
  links_json TEXT NOT NULL DEFAULT '{}',
  price_krw INTEGER NOT NULL DEFAULT 0,
  is_public INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by INTEGER
);

CREATE INDEX IF NOT EXISTS idx_books_publications_stage ON books_publications(stage, status);
CREATE INDEX IF NOT EXISTS idx_books_publications_public ON books_publications(is_public, sort_order);

CREATE TABLE IF NOT EXISTS books_service_catalog (
  code TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  pricing_model TEXT NOT NULL DEFAULT 'fixed',
  unit_label TEXT NOT NULL DEFAULT '',
  price_krw INTEGER NOT NULL DEFAULT 0,
  compare_price_krw INTEGER NOT NULL DEFAULT 0,
  included_json TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 100,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_books_services_category ON books_service_catalog(category, enabled, sort_order);

CREATE TABLE IF NOT EXISTS books_feature_flags (
  feature_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS books_inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  organization TEXT NOT NULL DEFAULT '',
  inquiry_type TEXT NOT NULL DEFAULT 'consultation',
  manuscript_stage TEXT NOT NULL DEFAULT '',
  length_note TEXT NOT NULL DEFAULT '',
  desired_channels TEXT NOT NULL DEFAULT '',
  budget_range TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  assigned_to TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_books_inquiries_status ON books_inquiries(status, created_at DESC);

INSERT OR IGNORE INTO books_publications (
  id, catalog_no, title, subtitle, author, series, series_number, publication_type,
  status, stage, editorial_field, language_label, format_json, edition, abstract,
  citation, cover_image, detail_url, google_books_id, distribution_json, links_json,
  price_krw, is_public, sort_order, created_at, updated_at
) VALUES (
  'ekodi-books-001', 'EB-MONO-001', '에코디언을 찾아서',
  '성경 속 숨겨진 하나님 백성의 진짜 모습', '정찬균', 'EKODI ORIGINAL', 1,
  'MONOGRAPH · PUBLIC THEOLOGY', 'FORTHCOMING · 2026', 'EDITING', 'Ecclesia',
  '한국어 · 영어 병기 / Amazon 영어 단독판 별도', '["EPUB 3","Reflowable Digital Edition"]',
  'Digital First Edition · v1.3',
  '교회를 건물과 제도의 언어에 가두지 않고, 성경의 큰 이야기 안에서 부름받은 백성의 삶으로 다시 읽는다. 에클레시아, 코이노니아, 디아스포라, 희년이라는 네 개의 오래된 언어를 오늘의 공동체와 일상으로 연결하며, 주일의 고백이 월요일의 선택으로 이어지는 신앙의 구조를 탐구한다.',
  '정찬균. 『에코디언을 찾아서: 성경 속 숨겨진 하나님 백성의 진짜 모습』. EKODI BOOKS, forthcoming 2026.',
  '/assets/ekodian-cover.svg', '/ekodian/', 'GGKEY:JBJ1HD5NPQ3',
  '{"google":"출간 준비 중","amazon":"영문판 준비 중","korea":"국내 유통 준비 중"}',
  '{"amazon":"","google":"","korea":""}', 8900, 1, 10,
  '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'
);

INSERT OR IGNORE INTO books_service_catalog (code, category, name, description, pricing_model, unit_label, price_krw, compare_price_krw, included_json, note, enabled, sort_order, updated_at) VALUES
('consult-fit', 'consultation', '출판 적합성 빠른상담', '원고 상태와 목표 채널을 확인하고 가장 작은 실행 단위를 제안합니다.', 'fixed', '20분', 0, 0, '["원고 상태 점검","출판 경로 제안","예상 범위 안내"]', '온라인 1회, 사전자료 기준', 1, 10, '2026-08-13T00:00:00.000Z'),
('consult-deep', 'consultation', '심층 출판상담', '원고 구조·독자·판형·전자책·유통 전략을 함께 설계합니다.', 'fixed', '60분', 50000, 0, '["원고 진단","출판 방식 설계","채널 우선순위","견적 초안"]', '14일 이내 대행 계약 시 상담료 전액 차감', 1, 20, '2026-08-13T00:00:00.000Z'),
('ebook-build', 'production', 'EPUB 3 제작', '일반 텍스트 중심 원고를 리플로어블 EPUB 3로 제작·검수합니다.', 'from', '1권', 150000, 0, '["EPUB 3 변환","목차·링크","모바일 검수","기본 메타데이터"]', '복잡한 표·수식·다국어 조판은 별도 산정', 1, 30, '2026-08-13T00:00:00.000Z'),
('print-master', 'production', '인쇄용 PDF 마스터', 'POD·소량인쇄를 위한 내지와 출력용 PDF 마스터를 제작합니다.', 'from', '1권', 150000, 0, '["판형 설정","내지 기본조판","PDF 마스터","출력 검수"]', '고난도 편집·도판은 별도', 1, 40, '2026-08-13T00:00:00.000Z'),
('cover-template', 'design', '표지 디자인 · 템플릿형', 'EKODI BOOKS의 정돈된 편집 체계를 활용해 빠르게 제작합니다.', 'fixed', '1종', 120000, 0, '["전자책 표지","수정 2회","채널별 이미지"]', '원본 이미지 구매비 별도', 1, 50, '2026-08-13T00:00:00.000Z'),
('cover-custom', 'design', '표지 디자인 · 맞춤형', '책의 논지와 독자층에 맞춰 독립적인 비주얼 콘셉트를 설계합니다.', 'from', '1종', 250000, 0, '["콘셉트 제안","전자책 표지","인쇄 확장 가능","수정 3회"]', '촬영·일러스트 외주비 별도', 1, 60, '2026-08-13T00:00:00.000Z'),
('metadata-id', 'distribution', '서지·식별자 등록대행', 'ISBN·상품 메타데이터·기본 서지정보를 정리해 등록 업무를 지원합니다.', 'fixed', '1권', 50000, 0, '["서지정보 정리","식별자 체크","메타데이터 시트"]', '공식기관 또는 플랫폼에 납부하는 비용이 있으면 실비 별도', 1, 70, '2026-08-13T00:00:00.000Z'),
('channel-setup', 'distribution', '유통채널 등록대행', '준비된 파일과 메타데이터를 지정 플랫폼에 등록합니다.', 'fixed', '채널 1곳', 50000, 0, '["상품 등록","가격 설정","검수 대응 1회"]', '플랫폼 계정·정산정보는 권리자가 보유', 1, 80, '2026-08-13T00:00:00.000Z'),
('digital-start', 'package', 'DIGITAL START', '전자책 한 권을 가장 작은 비용으로 출간하기 위한 기본 패키지입니다.', 'fixed', '1권', 290000, 340000, '["EPUB 3 제작","기본 메타데이터","유통채널 1곳","출간 체크리스트"]', '원고 교정·맞춤표지 제외', 1, 100, '2026-08-13T00:00:00.000Z'),
('distribute', 'package', 'DISTRIBUTE', '전자책 제작과 기본 표지, 주요 채널 등록을 한 번에 묶습니다.', 'fixed', '1권', 490000, 620000, '["EPUB 3 제작","템플릿형 표지","서지 정리","유통채널 최대 3곳"]', '상위 패키지일수록 개별 구매 대비 단가 절감', 1, 110, '2026-08-13T00:00:00.000Z'),
('publish-pro', 'package', 'PUBLISH PRO', '원고 진단부터 전자·인쇄 마스터와 유통까지 연결하는 출판대행 패키지입니다.', 'from', '1권', 890000, 1070000, '["심층상담","원고 구조 점검","EPUB 3","인쇄용 PDF","맞춤표지","서지·식별자","유통채널 최대 3곳","런칭용 기본 이미지"]', '전문 교정교열·번역·대량인쇄는 별도', 1, 120, '2026-08-13T00:00:00.000Z'),
('series-partner', 'package', 'SERIES / INSTITUTION', '연구소·교회·기관의 연속간행물과 시리즈를 반복 가능한 출판 체계로 구축합니다.', 'quote', '프로젝트', 0, 0, '["시리즈 규격","반복 워크플로우","메타데이터 표준","다권 유통"]', '범위 확인 후 견적', 1, 130, '2026-08-13T00:00:00.000Z');

INSERT OR IGNORE INTO books_feature_flags (feature_key, label, description, enabled, updated_at) VALUES
('public_catalog', 'Public Catalog', '공개 도서 목록 노출', 1, '2026-08-13T00:00:00.000Z'),
('consultation', 'Consultation', '출판 상담 신청', 1, '2026-08-13T00:00:00.000Z'),
('publishing_agency', 'Publishing Agency', '출판대행 서비스 및 견적 신청', 1, '2026-08-13T00:00:00.000Z'),
('pricing', 'Public Pricing', '공개 요금표 노출', 1, '2026-08-13T00:00:00.000Z'),
('amazon', 'Amazon Distribution', 'Amazon KDP 유통 지원', 1, '2026-08-13T00:00:00.000Z'),
('google', 'Google Distribution', 'Google Play Books 유통 지원', 1, '2026-08-13T00:00:00.000Z'),
('korea', 'Korea Distribution', '국내 유통 지원', 1, '2026-08-13T00:00:00.000Z'),
('pod', 'Print on Demand', 'POD·소량인쇄 지원', 1, '2026-08-13T00:00:00.000Z'),
('royalties', 'Royalty Management', '판매·정산·인세 관리', 0, '2026-08-13T00:00:00.000Z'),
('membership', 'Membership', '독자 멤버십', 0, '2026-08-13T00:00:00.000Z');