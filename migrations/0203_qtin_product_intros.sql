-- EKODI-QTIN-AFFILIATION-INTRO-005
-- 큐티인 표지를 누르면 보여 줄 책 소개(QTM 상품 상세설명: 목차·책 속으로·출판사 서평 등).
-- QTM 상품번호 단위로 저장하고, 도서 동기화 때 함께 갱신한다. Additive only, 재실행 안전.
CREATE TABLE IF NOT EXISTS qtin_product_intros (
  qtm_item_id TEXT PRIMARY KEY,
  intro TEXT NOT NULL DEFAULT '',
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
