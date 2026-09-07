import { createOpenAiProvider } from './openai-provider-adapter.js';
import { createAnthropicProvider } from './anthropic-provider-adapter.js';
import { createGeminiOrchestratorProvider } from './gemini-orchestrator-provider-adapter.js';

function priority(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function decorate(provider, metadata = {}) {
  return Object.freeze({
    ...provider,
    priority: priority(metadata.priority ?? provider.priority, 100),
    capabilities: Object.freeze([...(metadata.capabilities || provider.capabilities || ['text'])]),
    trustClass: String(metadata.trustClass || provider.trustClass || 'external').trim().toLowerCase() || 'external',
  });
}

export function createEkodiAiProviderRegistry(env = {}, options = {}) {
  const providers = [
    decorate(createOpenAiProvider(env, { fetchImpl: options.fetchImpl }), {
      priority: priority(env.OPENAI_PRIORITY, 10),
      capabilities: ['text', 'reasoning', 'code', 'vision'],
    }),
    decorate(createAnthropicProvider(env, { fetchImpl: options.fetchImpl }), {
      priority: priority(env.ANTHROPIC_PRIORITY, 20),
    }),
    decorate(createGeminiOrchestratorProvider(env, { fetchImpl: options.fetchImpl }), {
      priority: priority(env.GEMINI_PRIORITY, 30),
    }),
  ];
  return Object.freeze(providers);
}

export function getEkodiAiProviderRegistryStatus(env = {}) {
  return Object.freeze(createEkodiAiProviderRegistry(env).map(provider => Object.freeze({
    id: provider.id,
    model: provider.model || null,
    available: provider.available,
    priority: provider.priority,
    capabilities: provider.capabilities,
    trustClass: provider.trustClass,
  })));
}
