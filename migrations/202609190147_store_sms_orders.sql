-- Store-scoped SMS ordering foundation.
-- Raw phone numbers are intentionally not stored. The external SMS bridge supplies
-- an opaque external_thread_id which remains inside messenger_channel_links.

CREATE TABLE IF NOT EXISTS store_sms_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_slug TEXT NOT NULL,
  thread_id INTEGER NOT NULL REFERENCES messenger_threads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'awaiting_customer_confirmation'
    CHECK (status IN ('awaiting_customer_confirmation','customer_confirmed','store_accepted','completed','cancelled','rejected')),
  raw_order_text TEXT NOT NULL,
  customer_display TEXT NOT NULL DEFAULT '',
  confirmed_at TEXT,
  accepted_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  rejected_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS store_sms_orders_store_status_idx
  ON store_sms_orders(store_slug,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS store_sms_orders_thread_idx
  ON store_sms_orders(thread_id,id DESC);

CREATE TABLE IF NOT EXISTS store_sms_ingress_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_event_id TEXT NOT NULL UNIQUE,
  store_slug TEXT NOT NULL,
  thread_id INTEGER NOT NULL REFERENCES messenger_threads(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES store_sms_orders(id) ON DELETE SET NULL,
  message_id INTEGER REFERENCES messenger_messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS store_sms_ingress_events_store_idx
  ON store_sms_ingress_events(store_slug,created_at DESC);
