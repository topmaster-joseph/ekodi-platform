-- MALL-MEMBER-POINT-001: verified member purchase evidence for a future canonical points ledger.
-- This is NOT a spendable points wallet, not an alternate points currency and does not grant
-- permissions to the absent production Supabase ekodi_point_ledger.
-- Orders are attached only to a Supabase Auth user verified by the Mall server.
CREATE TABLE IF NOT EXISTS member_purchase_point_orders (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE RESTRICT,
  auth_user_id TEXT NOT NULL CHECK (length(auth_user_id) BETWEEN 20 AND 90),
  rate_bps INTEGER NOT NULL DEFAULT 100 CHECK (rate_bps = 100),
  gross_krw INTEGER NOT NULL CHECK (gross_krw >= 0),
  eligible_points INTEGER NOT NULL DEFAULT 0 CHECK (eligible_points >= 0),
  refunded_krw INTEGER NOT NULL DEFAULT 0 CHECK (refunded_krw >= 0),
  state TEXT NOT NULL DEFAULT 'awaiting_payment'
    CHECK (state IN ('awaiting_payment','pending_core','reversed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS member_purchase_points_auth_order_idx
  ON member_purchase_point_orders(auth_user_id,updated_at DESC);
-- Append-only, replay-safe liability evidence; no browser INSERT or central grant.
CREATE TABLE IF NOT EXISTS member_purchase_point_events (
  event_key TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES member_purchase_point_orders(order_id) ON DELETE RESTRICT,
  auth_user_id TEXT NOT NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('purchase_paid','purchase_refund')),
  delta_points INTEGER NOT NULL CHECK (delta_points <> 0),
  verified_gross_krw INTEGER NOT NULL CHECK (verified_gross_krw > 0),
  cumulative_refund_krw INTEGER NOT NULL DEFAULT 0 CHECK (cumulative_refund_krw >= 0),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS member_purchase_points_outbox_order_idx
  ON member_purchase_point_events(order_id,created_at);
