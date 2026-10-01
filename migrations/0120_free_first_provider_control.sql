-- Add zero-cost external API providers to the governed central provider registry.
-- Cloudflare Workers AI remains the first AI Control resource and does not require an API-key row here.

INSERT OR IGNORE INTO ai_provider_registry
  (provider_id, display_name, provider_type, enabled, priority, default_model, secret_binding, cost_class, health_status, updated_at, updated_by)
VALUES
  ('openrouter', 'OpenRouter Free', 'official-api', 1, 20, 'openrouter/free', 'OPENROUTER_API_KEY', 'free-preferred', 'unknown', datetime('now'), 'system:free-first-provider-chain'),
  ('groq', 'Groq Free', 'official-api', 1, 30, 'openai/gpt-oss-20b', 'GROQ_API_KEY', 'free-preferred', 'unknown', datetime('now'), 'system:free-first-provider-chain');

UPDATE ai_provider_registry
SET enabled = 1,
    priority = CASE provider_id
      WHEN 'gemini' THEN 10
      WHEN 'openrouter' THEN 20
      WHEN 'groq' THEN 30
      WHEN 'openai' THEN 60
      WHEN 'anthropic' THEN 70
      ELSE priority
    END,
    updated_at = datetime('now'),
    updated_by = 'system:free-first-provider-chain'
WHERE provider_id IN ('gemini','openrouter','groq','openai','anthropic');

UPDATE ai_provider_routes
SET primary_provider = 'gemini',
    fallback_json = '["openrouter","groq","openai","anthropic"]',
    model_override = '',
    updated_at = datetime('now'),
    updated_by = 'system:free-first-provider-chain'
WHERE capability IN ('default','documents','admin','marketing','translation');

INSERT OR IGNORE INTO ai_provider_routes
  (capability, primary_provider, fallback_json, model_override, updated_at, updated_by)
VALUES
  ('translation', 'gemini', '["openrouter","groq","openai","anthropic"]', '', datetime('now'), 'system:free-first-provider-chain');
