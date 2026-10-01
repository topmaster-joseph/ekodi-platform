-- EKODI-AI-EXTENDED-FREE-PROVIDERS-001
-- Extend the canonical free-first chain with guarded free-credit providers.
-- Cerebras: free-trial-only confirmation required.
-- Qwen: Alibaba Model Studio Free Quota Only confirmation required.
-- DeepSeek: runtime preflight requires granted_balance > 0 and topped_up_balance = 0.
-- None of these providers may silently consume paid balance.

INSERT OR IGNORE INTO ai_provider_registry
  (provider_id, display_name, provider_type, enabled, priority, default_model, secret_binding, cost_class, health_status, updated_at, updated_by)
VALUES
  ('cerebras-free', 'Cerebras · 무료 체험', 'official-api', 0, 40, 'qwen-3.8-27b', 'CEREBRAS_API_KEY', 'free-preferred', 'unknown', datetime('now'), 'system:extended-free-provider-chain'),
  ('qwen-free', 'Qwen · 무료 할당량', 'official-api', 0, 45, 'qwen3.7-plus', 'QWEN_API_KEY', 'free-preferred', 'unknown', datetime('now'), 'system:extended-free-provider-chain'),
  ('deepseek-free-credit', 'DeepSeek · 무료 지급 크레딧', 'official-api', 0, 50, 'deepseek-flash', 'DEEPSEEK_API_KEY', 'free-preferred', 'unknown', datetime('now'), 'system:extended-free-provider-chain');

UPDATE ai_provider_registry
SET priority = CASE provider_id
      WHEN 'cloudflare-workers-ai' THEN 5
      WHEN 'gemini' THEN 10
      WHEN 'openrouter-free' THEN 20
      WHEN 'groq-free' THEN 30
      WHEN 'cerebras-free' THEN 40
      WHEN 'qwen-free' THEN 45
      WHEN 'deepseek-free-credit' THEN 50
      WHEN 'openai' THEN 60
      WHEN 'anthropic' THEN 70
      ELSE priority
    END,
    updated_at = datetime('now'),
    updated_by = 'system:extended-free-provider-chain'
WHERE provider_id IN (
  'cloudflare-workers-ai','gemini','openrouter-free','groq-free',
  'cerebras-free','qwen-free','deepseek-free-credit','openai','anthropic'
);

UPDATE ai_provider_routes
SET primary_provider = 'cloudflare-workers-ai',
    fallback_json = '["gemini","openrouter-free","groq-free","cerebras-free","qwen-free","deepseek-free-credit","openai","anthropic"]',
    model_override = '',
    updated_at = datetime('now'),
    updated_by = 'system:extended-free-provider-chain'
WHERE capability IN ('default','documents','admin','marketing','translation');
