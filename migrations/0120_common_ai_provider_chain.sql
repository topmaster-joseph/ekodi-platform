-- EKODI-AI-PROVIDER-CHAIN-001
-- Canonical common-provider order:
-- Cloudflare / included resources -> Gemini Free -> OpenRouter Free -> Groq Free
-- -> OpenAI paid approval -> Claude paid approval.
-- Paid providers remain governed by AI-COST-001 and are never auto-escalated.

INSERT OR IGNORE INTO ai_provider_registry
  (provider_id, display_name, provider_type, enabled, priority, default_model, secret_binding, cost_class, health_status, updated_at, updated_by)
VALUES
  ('cloudflare-workers-ai', 'Cloudflare / 무료 자원', 'hosted-ai', 1, 5, '@cf/meta/llama-3.1-8b-instruct-fast', '', 'account-managed', 'unknown', datetime('now'), 'system:common-provider-chain'),
  ('openrouter-free', 'OpenRouter Free', 'official-api', 1, 20, 'openrouter/free', 'OPENROUTER_API_KEY', 'free-preferred', 'unknown', datetime('now'), 'system:common-provider-chain'),
  ('groq-free', 'Groq Free', 'official-api', 1, 30, 'openai/gpt-oss-20b', 'GROQ_API_KEY', 'free-preferred', 'unknown', datetime('now'), 'system:common-provider-chain');

UPDATE ai_provider_registry
SET display_name = CASE provider_id
      WHEN 'cloudflare-workers-ai' THEN 'Cloudflare / 무료 자원'
      WHEN 'gemini' THEN 'Gemini Free'
      WHEN 'openrouter-free' THEN 'OpenRouter Free'
      WHEN 'groq-free' THEN 'Groq Free'
      WHEN 'openai' THEN 'OpenAI · 유료 승인'
      WHEN 'anthropic' THEN 'Claude · 유료 승인'
      ELSE display_name
    END,
    enabled = 1,
    priority = CASE provider_id
      WHEN 'cloudflare-workers-ai' THEN 5
      WHEN 'gemini' THEN 10
      WHEN 'openrouter-free' THEN 20
      WHEN 'groq-free' THEN 30
      WHEN 'openai' THEN 60
      WHEN 'anthropic' THEN 70
      ELSE priority
    END,
    cost_class = CASE provider_id
      WHEN 'cloudflare-workers-ai' THEN 'account-managed'
      WHEN 'gemini' THEN 'free-preferred'
      WHEN 'openrouter-free' THEN 'free-preferred'
      WHEN 'groq-free' THEN 'free-preferred'
      WHEN 'openai' THEN 'paid-opt-in'
      WHEN 'anthropic' THEN 'paid-opt-in'
      ELSE cost_class
    END,
    updated_at = datetime('now'),
    updated_by = 'system:common-provider-chain'
WHERE provider_id IN ('cloudflare-workers-ai','gemini','openrouter-free','groq-free','openai','anthropic');

INSERT OR IGNORE INTO ai_provider_routes
  (capability, primary_provider, fallback_json, model_override, updated_at, updated_by)
VALUES
  ('default', 'cloudflare-workers-ai', '["gemini","openrouter-free","groq-free","openai","anthropic"]', '', datetime('now'), 'system:common-provider-chain'),
  ('documents', 'cloudflare-workers-ai', '["gemini","openrouter-free","groq-free","openai","anthropic"]', '', datetime('now'), 'system:common-provider-chain'),
  ('admin', 'cloudflare-workers-ai', '["gemini","openrouter-free","groq-free","openai","anthropic"]', '', datetime('now'), 'system:common-provider-chain'),
  ('marketing', 'cloudflare-workers-ai', '["gemini","openrouter-free","groq-free","openai","anthropic"]', '', datetime('now'), 'system:common-provider-chain'),
  ('translation', 'cloudflare-workers-ai', '["gemini","openrouter-free","groq-free","openai","anthropic"]', '', datetime('now'), 'system:common-provider-chain');

UPDATE ai_provider_routes
SET primary_provider = 'cloudflare-workers-ai',
    fallback_json = '["gemini","openrouter-free","groq-free","openai","anthropic"]',
    model_override = '',
    updated_at = datetime('now'),
    updated_by = 'system:common-provider-chain'
WHERE capability IN ('default','documents','admin','marketing','translation');
