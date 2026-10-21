-- EKODI-FACTCHAT-DUAL-ACCOUNT-001
-- Register FactChat (Mindlogic BAZE API Gateway) as two strictly separated opt-in providers.
--  factchat-ekodi:       EKODI's own gateway key (FACTCHAT_EKODI_API_KEY). Credits are an EKODI
--                        spend, so cost_class is paid-opt-in and traffic needs an explicit budget.
--  factchat-institution: the 국립목포대학교 institutional key (FACTCHAT_MOKPO_API_KEY). Usable only
--                        after a super_admin approves institutional use
--                        (EKODI_FACTCHAT_INSTITUTION_USE_APPROVED); approval is re-affirmed on each save.
-- Both start disabled and are NOT added to any capability's fallback chain: the canonical
-- free-first chain is unchanged, and a super_admin routes a capability to them explicitly.
-- Additive only: no existing row, route or priority is modified.

INSERT OR IGNORE INTO ai_provider_registry
  (provider_id, display_name, provider_type, enabled, priority, default_model, secret_binding, cost_class, health_status, updated_at, updated_by)
VALUES
  ('factchat-ekodi', 'FactChat · 에코디 계정', 'official-api', 0, 80, 'gpt-5.6-luna', 'FACTCHAT_EKODI_API_KEY', 'paid-opt-in', 'unknown', datetime('now'), 'system:factchat-dual-account'),
  ('factchat-institution', 'FactChat · 국립목포대 기관계정', 'official-api', 0, 90, 'gpt-5.6-luna', 'FACTCHAT_MOKPO_API_KEY', 'account-managed', 'unknown', datetime('now'), 'system:factchat-dual-account');
