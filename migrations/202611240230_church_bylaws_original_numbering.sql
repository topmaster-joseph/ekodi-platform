-- 교회 정관 원본(cdoc-2027-selfreliance-04): 제10장 재정의 중복 조항 번호(제14·15조 → 제16·17조)와 '1윌' 오타 교정.
-- 사용자 승인(2026-11-24). 고치기 전 본문은 수정 이력에 남긴다.
INSERT OR IGNORE INTO church_document_revisions (id,doc_id,html,saved_at,saved_by)
  SELECT 'cdrev-20261124-0230-04','cdoc-2027-selfreliance-04',html,updated_at,updated_by
  FROM church_document_contents WHERE doc_id='cdoc-2027-selfreliance-04';
UPDATE church_document_contents SET
  html=REPLACE(REPLACE(REPLACE(html,
    '<b>제14조 (재정)</b>','<b>제16조 (재정)</b>'),
    '<b>제15조 (담임목사사례금)</b>','<b>제17조 (담임목사사례금)</b>'),
    '매년 1윌 1일','매년 1월 1일'),
  updated_at='2026-11-24T02:30:00Z', updated_by='claude'
WHERE doc_id='cdoc-2027-selfreliance-04';
