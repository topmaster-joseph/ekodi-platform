-- EKODI-FUNDING-003 — 운영자 저장 시 모금 주체 선택이 초기화되던 버그(첫 항목 '에코디비즈'로 저장)로
-- 시범 펀딩의 모금 주체가 바뀐 것을 원래 값(에코디출판)으로 되돌린다. 작성 중인 시범 펀딩에만 적용된다.
UPDATE funding_campaigns SET owner_org='publishing'
 WHERE id='fund_pilot_publishing_2026' AND owner_org='ekodibiz' AND status IN ('draft','rejected');
