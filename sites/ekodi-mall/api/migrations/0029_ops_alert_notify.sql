-- EKODI-OPERATOR-NOTIFY-001: 운영자 메시지 발송 상태(추가 컬럼만, 기존 데이터 불변).
ALTER TABLE mall_ops_alerts ADD COLUMN notified_at TEXT;
ALTER TABLE mall_ops_alerts ADD COLUMN reminded_at TEXT;
ALTER TABLE mall_ops_alerts ADD COLUMN notify_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mall_ops_alerts ADD COLUMN notify_error TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_mall_ops_alerts_notify ON mall_ops_alerts(status, notified_at, created_at);
