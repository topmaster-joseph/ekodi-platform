PRAGMA foreign_keys = ON;

-- Register Yuanfeng / Harbin Jixing as an EKODI Mall supplier candidate.
-- Do not advance beyond candidate until business verification, contract,
-- privacy processing, returns and CS policy references are complete.

INSERT INTO supplier_partners (
  id,
  partner_code,
  display_name,
  legal_name,
  provider_type,
  onboarding_status,
  status_note,
  auto_order_allowed,
  created_at,
  updated_at
) VALUES (
  'sup_29da090183d19dc2fa35a039151328f4',
  'harbin-jixing',
  '하얼빈 길성 히터',
  '哈尔滨吉星加热器有限公司',
  'contract_supplier',
  'candidate',
  'Yuanfeng(元丰) 엔진·냉각수 예열기 한국 판매 검토. EKODI Trade 공급사 harbin-jixing과 연결. 사업자·공장 서류, 한국 인증 협조, 판매권, 반품·CS·A/S 및 개인정보 처리 조건 확인 전 계약/파일럿 전환 금지.',
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(partner_code) DO UPDATE SET
  display_name=excluded.display_name,
  legal_name=excluded.legal_name,
  provider_type=excluded.provider_type,
  status_note=excluded.status_note,
  auto_order_allowed=0,
  updated_at=CURRENT_TIMESTAMP;
