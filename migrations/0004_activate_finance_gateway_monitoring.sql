CREATE TABLE IF NOT EXISTS service_controls (
  service_id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'planned',
  monitor_enabled INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by INTEGER
);

INSERT OR IGNORE INTO service_controls (service_id,state,monitor_enabled,note,updated_at)
VALUES
  ('pay','active',1,'EKODI 공통 결제 게이트',CURRENT_TIMESTAMP),
  ('trade','active',1,'정식 주소: trade.ekodi.kr',CURRENT_TIMESTAMP);

UPDATE service_controls
SET state='active', monitor_enabled=1, note='EKODI 공통 결제 게이트', updated_at=CURRENT_TIMESTAMP
WHERE service_id='pay';

UPDATE service_controls
SET state='active', monitor_enabled=1, note='정식 주소: trade.ekodi.kr', updated_at=CURRENT_TIMESTAMP
WHERE service_id='trade';
