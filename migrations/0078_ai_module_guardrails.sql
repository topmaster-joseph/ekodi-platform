ALTER TABLE ai_module_audit_logs ADD COLUMN provider_model TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_module_audit_logs ADD COLUMN latency_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_module_audit_logs ADD COLUMN storage_status TEXT NOT NULL DEFAULT 'not_requested';
ALTER TABLE ai_module_audit_logs ADD COLUMN guardrail_policy_version TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_module_audit_logs ADD COLUMN error_code TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_ai_module_audit_error ON ai_module_audit_logs(error_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_module_audit_guardrail ON ai_module_audit_logs(guardrail_policy_version, created_at DESC);
