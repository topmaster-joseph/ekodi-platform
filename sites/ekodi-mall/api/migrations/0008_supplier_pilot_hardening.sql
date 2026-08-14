PRAGMA foreign_keys = ON;

-- Supplier Partner와 seller source의 integration type이 섞이면 발주권한 해석이 달라질 수 있으므로 DB에서 차단한다.
CREATE TRIGGER IF NOT EXISTS trg_supplier_partner_source_type_insert
BEFORE INSERT ON supplier_partner_sources
WHEN (
  SELECT sp.provider_type
  FROM supplier_partners sp
  WHERE sp.id = NEW.partner_id
) <> (
  SELECT prv.provider_type
  FROM sourcing_sources ss
  JOIN sourcing_providers prv ON prv.id = ss.provider_id
  WHERE ss.id = NEW.source_id
)
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_PARTNER_SOURCE_PROVIDER_MISMATCH');
END;

CREATE TRIGGER IF NOT EXISTS trg_supplier_partner_source_type_update
BEFORE UPDATE OF partner_id, source_id ON supplier_partner_sources
WHEN (
  SELECT sp.provider_type
  FROM supplier_partners sp
  WHERE sp.id = NEW.partner_id
) <> (
  SELECT prv.provider_type
  FROM sourcing_sources ss
  JOIN sourcing_providers prv ON prv.id = ss.provider_id
  WHERE ss.id = NEW.source_id
)
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_PARTNER_SOURCE_PROVIDER_MISMATCH');
END;

-- V1 실제 파일럿은 계약 공급자의 manual_forward만 허용한다.
-- Supplier API Partner는 별도 API 권한/취소/idempotency/실패복구 검증 전 pilot_active로 갈 수 없다.
CREATE TRIGGER IF NOT EXISTS trg_supplier_partner_manual_first_pilot
BEFORE UPDATE OF onboarding_status ON supplier_partners
WHEN NEW.onboarding_status = 'pilot_active' AND NEW.provider_type <> 'contract_supplier'
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_API_PILOT_REQUIRES_SEPARATE_READINESS');
END;

-- 계약 단계 이상에서는 업체단위 핵심 검증참조가 모두 존재해야 한다.
CREATE TRIGGER IF NOT EXISTS trg_supplier_partner_contract_refs
BEFORE UPDATE OF onboarding_status ON supplier_partners
WHEN NEW.onboarding_status IN ('contracted','pilot_ready','pilot_active','active')
  AND (
    trim(NEW.business_verification_ref) = '' OR
    trim(NEW.master_contract_ref) = '' OR
    trim(NEW.pii_processor_ref) = '' OR
    trim(NEW.returns_policy_ref) = '' OR
    trim(NEW.cs_policy_ref) = ''
  )
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_PARTNER_CONTRACT_REFS_REQUIRED');
END;

-- Pilot 실행 단계는 검증된 seller/source 계약과 실제 SKU→상품 매핑이 모두 있어야 한다.
CREATE TRIGGER IF NOT EXISTS trg_supplier_partner_pilot_readiness
BEFORE UPDATE OF onboarding_status ON supplier_partners
WHEN NEW.onboarding_status = 'pilot_active'
  AND (
    (SELECT COUNT(*) FROM supplier_partner_sources sps
      WHERE sps.partner_id = NEW.id AND sps.mapping_status IN ('contract_verified','pilot','active')) < 1
    OR
    (SELECT COUNT(*) FROM supplier_sku_product_links spl
      JOIN supplier_skus sk ON sk.id = spl.supplier_sku_id
      WHERE sk.partner_id = NEW.id AND spl.mapping_status IN ('pilot','active')) < 1
  )
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_PARTNER_PILOT_READINESS_REQUIRED');
END;

-- 정식 active 전환은 실제 파일럿 완료 근거가 있어야 한다.
CREATE TRIGGER IF NOT EXISTS trg_supplier_partner_active_evidence
BEFORE UPDATE OF onboarding_status ON supplier_partners
WHEN NEW.onboarding_status = 'active' AND trim(NEW.pilot_evidence_ref) = ''
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_PARTNER_PILOT_EVIDENCE_REQUIRED');
END;

-- 현재 버전에서는 어떠한 코드경로도 Partner 자동발주 권한을 켤 수 없다.
CREATE TRIGGER IF NOT EXISTS trg_supplier_partner_auto_order_lock_insert
BEFORE INSERT ON supplier_partners
WHEN NEW.auto_order_allowed <> 0
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_AUTO_ORDER_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS trg_supplier_partner_auto_order_lock_update
BEFORE UPDATE OF auto_order_allowed ON supplier_partners
WHEN NEW.auto_order_allowed <> 0
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_AUTO_ORDER_LOCKED');
END;
