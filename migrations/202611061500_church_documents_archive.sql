-- 에코디교회 목회자 관리자 · 문서보관 (/ekodichurch/admin/documents)
-- 원본은 joseph@ekodi.kr 구글드라이브에 두고, 관리자 화면에는 구글문서·한글 파일 링크와 보관 정보를 기록합니다.
-- 링크는 드라이브 공유 권한이 있는 계정만 열 수 있습니다.
CREATE TABLE IF NOT EXISTS church_documents (
  id TEXT PRIMARY KEY,
  bundle TEXT NOT NULL DEFAULT '',
  bundle_url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '기타',
  doc_year TEXT NOT NULL DEFAULT '',
  gdoc_url TEXT NOT NULL DEFAULT '',
  hwpx_url TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_church_documents_bundle ON church_documents(status, bundle, sort_order);

INSERT OR IGNORE INTO church_documents (id,bundle,bundle_url,title,category,doc_year,gdoc_url,hwpx_url,note,sort_order,created_by,created_at,updated_at) VALUES
('cdoc-2027-selfreliance-00','2027 목포노회 동반성장 자립화교회 지원신청','https://drive.google.com/drive/folders/1L15wIRub_ZoDnuUgOCoxRPAw5Xtp_Iba','제출서류 체크리스트','제출서류','2026','https://docs.google.com/document/d/1jB0FxYeQbeM5nBAToYik5okTdIlgbhlCL_AOTJIZPrI/edit','https://drive.google.com/file/d/1dyt4oueXcOnThWib-22o5io9F4EwzuyK/view','제출 기한 2026.11.23.(월) · 목포노회 동반목회지원위원회',0,'seed:claude','2026-11-06T13:30:00Z','2026-11-06T13:30:00Z'),
('cdoc-2027-selfreliance-01','2027 목포노회 동반성장 자립화교회 지원신청','https://drive.google.com/drive/folders/1L15wIRub_ZoDnuUgOCoxRPAw5Xtp_Iba','서식 1-1 동반목회지원 신청서','신청서','2026','https://docs.google.com/document/d/118BaJod_NqKp0crJGVsgHExx2FC4J-hV_vZuVLP3Lh4/edit','https://drive.google.com/file/d/11QuWEpZZYs3YH4lup6r33265PSjCafP-/view','개인정보 동의서 포함 · 서명·날인 필요',1,'seed:claude','2026-11-06T13:30:00Z','2026-11-06T13:30:00Z'),
('cdoc-2027-selfreliance-02','2027 목포노회 동반성장 자립화교회 지원신청','https://drive.google.com/drive/folders/1L15wIRub_ZoDnuUgOCoxRPAw5Xtp_Iba','서식 1-2 목회계획서','목회계획서','2026','https://docs.google.com/document/d/13wG68rlfgt7M0ns6fr-SsmADHvJZYWvqJl3KffdzFHk/edit','https://drive.google.com/file/d/1PcCm1sR7ggM7LGgLp6D6LIGtVFyU8VFv/view','2027년 목회계획',2,'seed:claude','2026-11-06T13:30:00Z','2026-11-06T13:30:00Z'),
('cdoc-2027-selfreliance-04','2027 목포노회 동반성장 자립화교회 지원신청','https://drive.google.com/drive/folders/1L15wIRub_ZoDnuUgOCoxRPAw5Xtp_Iba','교회 정관(안)','정관','2026','https://docs.google.com/document/d/1WlW4wY8_DuYVLSwp3urjO_ZRPs2cVqfTBTsbaanwGjE/edit','https://drive.google.com/file/d/1R3v7ASdxUnY30G7Ullw95yhFs7IMEh2O/view','2026.11.15. 공동의회 의결 예정',4,'seed:claude','2026-11-06T13:30:00Z','2026-11-06T13:30:00Z'),
('cdoc-2027-selfreliance-06','2027 목포노회 동반성장 자립화교회 지원신청','https://drive.google.com/drive/folders/1L15wIRub_ZoDnuUgOCoxRPAw5Xtp_Iba','공동의회 회의록(안)','회의록','2026','https://docs.google.com/document/d/19icB4SYzPFwx7qMwY2dsHNaJWmKVSWxNVpFVj-z9jrQ/edit','https://drive.google.com/file/d/1x6SUhFrZnoVe-9d0-T9c_5EF3OvJRQPz/view','2024·2025 결산, 2026 예산, 정관, 공간 무상사용, 지원신청',6,'seed:claude','2026-11-06T13:30:00Z','2026-11-06T13:30:00Z'),
('cdoc-2027-selfreliance-07','2027 목포노회 동반성장 자립화교회 지원신청','https://drive.google.com/drive/folders/1L15wIRub_ZoDnuUgOCoxRPAw5Xtp_Iba','연도별 결산 및 교인현황(2024·2025)','결산','2024-2025','https://docs.google.com/document/d/1UUAsjDf_CRZ360SwNw7VKsC6eaW7hc2imu0vo7BzZNs/edit','https://drive.google.com/file/d/1esSBwz9Srw6m_kvurhe40XGkRazQSPYX/view','결산 2,400,000원 · 세례교인 8명 · 예배처 월세 0원',7,'seed:claude','2026-11-06T13:30:00Z','2026-11-06T13:30:00Z');
