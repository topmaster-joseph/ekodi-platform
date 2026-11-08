-- 에코디교회 문서보관: 2027 자립화교회 지원신청 발급서류 등록(2026.11.09) 및 통장사본 정정
-- 05 통장사본: 케이뱅크 '에코디' 계좌는 교회 계좌가 아니므로 정정. 교회 공식 계좌(농협, 예금주 에코디교회) 통장사본 발급 필요.
UPDATE church_documents SET title='통장사본(농협 · 예금주 에코디교회) — 발급 필요', gdoc_url='', doc_year='2026',
  note='교회 공식 계좌 농협 355-0088-5391-83. 구글드라이브·Gmail에 통장사본 없음 → 농협 앱/창구에서 통장사본 발급 후 등록. (이전 등록한 케이뱅크 에코디 계좌는 교회 계좌 아님)',
  updated_at='2026-11-09T08:10:00Z' WHERE id='cdoc-2027-selfreliance-05';
INSERT OR IGNORE INTO church_documents (id,bundle,bundle_url,title,category,doc_year,gdoc_url,hwpx_url,note,sort_order,created_by,created_at,updated_at) VALUES
('cdoc-2027-selfreliance-08','2027 목포노회 동반성장 자립화교회 지원신청','https://drive.google.com/drive/folders/1L15wIRub_ZoDnuUgOCoxRPAw5Xtp_Iba','소득금액증명(2025년 귀속)','소득증명','2025','https://drive.google.com/file/d/1adTF8sQFELcM5YNx-wOkO3K62fHM9YBS/view','','2026.11.09 목포세무서 발급(홈택스). 주민등록번호 포함 — 제출 시 뒷자리 가림 여부 확인',8,'claude','2026-11-09T08:10:00Z','2026-11-09T08:10:00Z'),
('cdoc-2027-selfreliance-09','2027 목포노회 동반성장 자립화교회 지원신청','https://drive.google.com/drive/folders/1L15wIRub_ZoDnuUgOCoxRPAw5Xtp_Iba','건강·장기요양보험료 납부확인서(2026년)','건강보험','2026','https://drive.google.com/file/d/1-zGdcYBI3-aHBhHW170jCNafvaNz7xXY/view','','2026.11.09 국민건강보험공단 발급. 2026.01~12 납부내역(납부총액 123,130원)',9,'claude','2026-11-09T08:10:00Z','2026-11-09T08:10:00Z');
