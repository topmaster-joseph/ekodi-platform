-- EKODI-MALL-PRODUCT-SOURCE-001: 등록상품 출처 관리.
--  · API·AI 자동 소싱: 공급사(supply_provider/supply_item_no)는 내부에만 표기(공개 화면에는 노출하지 않음).
--  · 에코디언이 직접 등록하는 상인회 등 위탁 상품: 제공자(상인)명·연락처를 기록하고, 동의 시 상품 페이지에 표시.
ALTER TABLE products ADD COLUMN source_kind TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN source_name TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN source_contact TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN source_public INTEGER NOT NULL DEFAULT 0;
