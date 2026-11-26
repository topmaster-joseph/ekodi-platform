import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// Guardrail: feature modules must reach AI providers through the central EKODI
// router (ai-provider-control / ai-control-provider-router), which enforces
// free-first routing, budget, fallback, logging and evaluation. Only adapters
// and the explicitly reviewed modules below may talk to a vendor directly.
const VENDOR = /api\.openai\.com|generativelanguage\.googleapis\.com|api\.anthropic\.com|api\.groq\.com|openrouter\.ai\/api|api\.cerebras\.ai/;
const REVIEWED_DIRECT = new Set([
  'ai-provider-control.js',            // central router itself
  'ai-control-provider-router.js',     // control-plane router
  'admin-provider-control.js',         // provider catalogue/health probes
  'anthropic-workspace.js',            // Anthropic workspace admin (not inference)
  'ekodi-site-improvement-oidc-broker.js', // OIDC-scoped broker for CI agents
]);

test('feature modules do not call AI vendors directly', () => {
  const root = new URL('..', import.meta.url).pathname;
  const offenders = readdirSync(root)
    .filter(name => name.endsWith('.js') && !/provider-adapters?\.js$/.test(name) && !REVIEWED_DIRECT.has(name))
    .filter(name => VENDOR.test(readFileSync(root + name, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('ministry and community reports draft through the central router', () => {
  const root = new URL('..', import.meta.url).pathname;
  for (const name of ['church-reports-control.js', 'community-reports-control.js']) {
    const src = readFileSync(root + name, 'utf8');
    assert.match(src, /import \{ invokeAiProviderCapability \} from '\.\/ai-provider-control\.js';/);
    assert.match(src, /capability: 'documents'/);
    assert.doesNotMatch(src, /OPENAI_API_KEY|api\.openai\.com/);
    assert.match(src, /mode = 'smart-template'/); // template fallback stays
  }
});
