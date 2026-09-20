-- Activate the governed multi-provider pool while preserving free-first cost controls.
-- Paid providers are enabled for explicit opt-in only; AI-COST-001 still blocks automatic paid escalation.

UPDATE ai_provider_registry
SET enabled = 1,
    priority = CASE provider_id
      WHEN 'gemini' THEN 10
      WHEN 'openai' THEN 60
      WHEN 'anthropic' THEN 70
      ELSE priority
    END,
    updated_at = datetime('now'),
    updated_by = 'system:provider-pool-activation'
WHERE provider_id IN ('gemini','openai','anthropic');

INSERT OR IGNORE INTO ai_provider_routes
  (capability, primary_provider, fallback_json, model_override, updated_at, updated_by)
VALUES
  ('translation', 'gemini', '["openai","anthropic"]', '', datetime('now'), 'system:provider-pool-activation');

UPDATE ai_provider_routes
SET primary_provider = 'gemini',
    fallback_json = '["openai","anthropic"]',
    model_override = '',
    updated_at = datetime('now'),
    updated_by = 'system:provider-pool-activation'
WHERE capability IN ('default','documents','admin','marketing','translation');
