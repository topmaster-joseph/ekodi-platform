PRAGMA foreign_keys = ON;

-- 미래의 다른 내부 API도 confirmed 증거 3종 없이 후보를 Partner로 전환할 수 없다.
CREATE TRIGGER IF NOT EXISTS trg_supplier_candidate_confirmed_evidence_guard
BEFORE UPDATE OF candidate_status, converted_partner_id ON supplier_candidates
WHEN NEW.candidate_status = 'converted' AND (
  (SELECT COUNT(*) FROM supplier_candidate_evidence e
    WHERE e.candidate_id = NEW.id AND e.evidence_type = 'business_identity' AND e.verification_status = 'confirmed') < 1
  OR
  (SELECT COUNT(*) FROM supplier_candidate_evidence e
    WHERE e.candidate_id = NEW.id AND e.evidence_type = 'dropship' AND e.verification_status = 'confirmed') < 1
  OR
  (SELECT COUNT(*) FROM supplier_candidate_evidence e
    WHERE e.candidate_id = NEW.id AND e.evidence_type = 'rights' AND e.verification_status = 'confirmed') < 1
)
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_CANDIDATE_CONFIRMED_EVIDENCE_REQUIRED');
END;

-- 전환된 후보는 Partner 링크나 종료 상태를 다시 바꿀 수 없다.
CREATE TRIGGER IF NOT EXISTS trg_supplier_candidate_converted_immutable
BEFORE UPDATE OF candidate_status, converted_partner_id ON supplier_candidates
WHEN OLD.candidate_status = 'converted' AND (
  NEW.candidate_status <> OLD.candidate_status OR
  NEW.converted_partner_id IS NOT OLD.converted_partner_id
)
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_CANDIDATE_CONVERSION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_supplier_candidate_rejected_terminal
BEFORE UPDATE OF candidate_status ON supplier_candidates
WHEN OLD.candidate_status = 'rejected' AND NEW.candidate_status <> 'rejected'
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_CANDIDATE_REJECTED_TERMINAL');
END;

-- Preflight snapshot은 실제 Partner→Source→SKU→Product 연결과 일치해야 한다.
CREATE TRIGGER IF NOT EXISTS trg_supplier_preflight_chain_guard
BEFORE INSERT ON supplier_pilot_preflights
WHEN (
  SELECT COUNT(*)
  FROM supplier_skus sk
  JOIN supplier_partner_sources sps ON sps.partner_id = NEW.partner_id AND sps.source_id = NEW.source_id
  JOIN supplier_sku_product_links spl ON spl.supplier_sku_id = NEW.supplier_sku_id AND spl.product_id = NEW.product_id AND spl.source_id = NEW.source_id
  WHERE sk.id = NEW.supplier_sku_id
    AND sk.partner_id = NEW.partner_id
    AND sk.source_id = NEW.source_id
    AND sps.seller_id = NEW.seller_id
    AND spl.seller_id = NEW.seller_id
) <> 1
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_PREFLIGHT_CHAIN_MISMATCH');
END;

-- blockers가 있는데 ready 계열 상태를 기록하는 모순을 막는다.
CREATE TRIGGER IF NOT EXISTS trg_supplier_preflight_blocker_consistency
BEFORE INSERT ON supplier_pilot_preflights
WHEN NEW.readiness_status IN ('operational_ready','transaction_locked') AND trim(NEW.blockers_json) <> '[]'
BEGIN
  SELECT RAISE(ABORT, 'SUPPLIER_PREFLIGHT_BLOCKERS_NOT_EMPTY');
END;
