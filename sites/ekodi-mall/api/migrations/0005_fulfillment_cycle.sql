PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS supplier_contracts (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL UNIQUE REFERENCES sourcing_sources(id) ON DELETE RESTRICT,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(user_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','suspended','expired')),
  contract_ref TEXT NOT NULL DEFAULT '',
  pii_processor_ref TEXT NOT NULL DEFAULT '',
  returns_policy_ref TEXT NOT NULL DEFAULT '',
  cs_owner TEXT NOT NULL DEFAULT 'seller' CHECK (cs_owner IN ('seller','supplier','ekodi','shared')),
  shipping_sla_days INTEGER CHECK (shipping_sla_days IS NULL OR shipping_sla_days BETWEEN 0 AND 30),
  effective_at TEXT,
  expires_at TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_contracts_seller ON supplier_contracts(seller_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS fulfillment_orders (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(user_id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES sourcing_sources(id) ON DELETE RESTRICT,
  contract_id TEXT NOT NULL REFERENCES supplier_contracts(id) ON DELETE RESTRICT,
  procurement_decision_id TEXT REFERENCES procurement_decisions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_pii' CHECK (status IN (
    'awaiting_pii','ready_to_forward','forwarded','accepted','shipped','delivered',
    'cancel_requested','cancelled','return_requested','returned','refund_pending','closed','failed'
  )),
  execution_mode TEXT NOT NULL CHECK (execution_mode IN ('manual_forward','api_order')),
  supplier_cost_amount INTEGER NOT NULL CHECK (supplier_cost_amount >= 0),
  supplier_shipping_amount INTEGER NOT NULL CHECK (supplier_shipping_amount >= 0),
  supplier_payable_amount INTEGER NOT NULL CHECK (supplier_payable_amount >= 0),
  pii_release_status TEXT NOT NULL DEFAULT 'blocked' CHECK (pii_release_status IN ('blocked','approved','released','revoked')),
  pii_release_ref TEXT NOT NULL DEFAULT '',
  provider_order_ref TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL UNIQUE,
  forwarded_at TEXT,
  accepted_at TEXT,
  shipped_at TEXT,
  delivered_at TEXT,
  cancelled_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_fulfillment_seller ON fulfillment_orders(seller_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_fulfillment_source ON fulfillment_orders(source_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_fulfillment_order ON fulfillment_orders(order_id);

CREATE TABLE IF NOT EXISTS fulfillment_shipments (
  id TEXT PRIMARY KEY,
  fulfillment_id TEXT NOT NULL REFERENCES fulfillment_orders(id) ON DELETE CASCADE,
  carrier_code TEXT NOT NULL DEFAULT '',
  tracking_number TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'label_pending' CHECK (status IN ('label_pending','in_transit','delivered','exception','returned')),
  shipped_at TEXT,
  delivered_at TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_shipments_fulfillment ON fulfillment_shipments(fulfillment_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mall_shipments_tracking ON fulfillment_shipments(carrier_code,tracking_number) WHERE tracking_number<>'';

CREATE TABLE IF NOT EXISTS fulfillment_returns (
  id TEXT PRIMARY KEY,
  fulfillment_id TEXT NOT NULL REFERENCES fulfillment_orders(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  requested_by TEXT NOT NULL CHECK (requested_by IN ('buyer','seller','supplier','system')),
  reason_code TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','in_transit','received','refund_pending','refunded','closed')),
  return_received_at TEXT,
  refund_due_at TEXT,
  refund_completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_returns_fulfillment ON fulfillment_returns(fulfillment_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_returns_order ON fulfillment_returns(order_id,created_at DESC);

CREATE TABLE IF NOT EXISTS supplier_settlement_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fulfillment_id TEXT NOT NULL REFERENCES fulfillment_orders(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES sourcing_sources(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('purchase','refund','adjustment')),
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','payable','paid','reversed')),
  effective_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_settlement_source ON supplier_settlement_ledger(source_id,status,effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_supplier_settlement_fulfillment ON supplier_settlement_ledger(fulfillment_id,entry_type);

CREATE TABLE IF NOT EXISTS fulfillment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fulfillment_id TEXT NOT NULL REFERENCES fulfillment_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('seller','supplier','system','internal')),
  from_status TEXT NOT NULL DEFAULT '',
  to_status TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_fulfillment_events ON fulfillment_events(fulfillment_id,occurred_at DESC);
