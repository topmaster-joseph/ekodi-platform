PRAGMA foreign_keys = ON;

-- 도매매/도매꾹 공식 Open API 커넥터. 실주문은 별도 검증 전까지 항상 잠근다.
INSERT OR IGNORE INTO sourcing_providers
  (id,display_name,provider_type,integration_mode,connection_status,catalog_policy,order_mode,auto_order_enabled,customer_pii_allowed,created_at,updated_at)
VALUES
  ('domemae-official','도매매 · 도매꾹 공식 API','supplier_api','api','api_pending','reference_only','api_order',0,0,datetime('now'),datetime('now'));

CREATE TABLE IF NOT EXISTS supplier_connector_checks (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES sourcing_providers(id) ON DELETE RESTRICT,
  check_type TEXT NOT NULL CHECK (check_type IN ('readiness','item_lookup','contract_review','order_readiness')),
  external_ref TEXT NOT NULL DEFAULT '',
  result_status TEXT NOT NULL CHECK (result_status IN ('ok','blocked','failed')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_connector_checks_provider
  ON supplier_connector_checks(provider_id, checked_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_domemae_auto_order_lock_insert
BEFORE INSERT ON sourcing_providers
WHEN NEW.id='domemae-official' AND (NEW.auto_order_enabled<>0 OR NEW.customer_pii_allowed<>0)
BEGIN
  SELECT RAISE(ABORT, 'DOMEMAE_EXECUTION_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS trg_domemae_auto_order_lock_update
BEFORE UPDATE OF auto_order_enabled, customer_pii_allowed ON sourcing_providers
WHEN OLD.id='domemae-official' AND (NEW.auto_order_enabled<>0 OR NEW.customer_pii_allowed<>0)
BEGIN
  SELECT RAISE(ABORT, 'DOMEMAE_EXECUTION_LOCKED');
END;
