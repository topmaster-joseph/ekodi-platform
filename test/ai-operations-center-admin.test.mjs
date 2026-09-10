import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const center = readFileSync(new URL('../ai-operations-center-admin.js', import.meta.url), 'utf8');
const menu = readFileSync(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');
const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const providerControl = readFileSync(new URL('../ai-provider-control.js', import.meta.url), 'utf8');
const agentControl = readFileSync(new URL('../ai-agent-control.js', import.meta.url), 'utf8');

test('AI operations center source parses as JavaScript', () => {
  assert.doesNotThrow(() => new Function(center));
});

test('AI operations center is promoted without breaking canonical English menu contracts', () => {
  assert.match(menu, /ko: 'AI 운영센터'/);
  assert.match(menu, /en: 'AI & Agents'/);
  assert.match(menu, /id: 'openai'[\s\S]*?en: 'OpenAI'/);
  assert.match(menu, /import\('\.\/ai-operations-center-admin\.js'\)/);
  assert.match(menu, /globalPolicyMutation: 'super_admin'/);
});

test('AI operations center is included in the deployable admin build', () => {
  assert.match(build, /'ai-operations-center-admin\.js'/);
});

test('AI operations center uses the existing provider-neutral control contracts', () => {
  assert.match(center, /\/api\/ai-modules\/v1\/providers\/admin/);
  assert.match(center, /\/api\/control\/ai\/governance/);
  assert.match(center, /\/api\/control\/ai\/actions\?limit=30/);
  assert.match(center, /OpenAI·Gemini·Anthropic/);
  assert.match(providerControl, /PROVIDERS=new Set\(\['openai','gemini','anthropic'\]\)/);
});

test('provider mutations require the server confirmation contracts', () => {
  assert.match(center, /ai-provider-runtime-update/);
  assert.match(center, /ai-provider-route-update/);
  assert.match(center, /ai-provider-secret-connect/);
  assert.match(providerControl, /AI_PROVIDER_CONFIRMATION_REQUIRED/);
  assert.match(providerControl, /AI_PROVIDER_ROUTE_CONFIRMATION_REQUIRED/);
  assert.match(providerControl, /AI_PROVIDER_SECRET_CONFIRMATION_REQUIRED/);
});

test('provider secrets remain write-only from the admin surface', () => {
  assert.match(center, /type="password"/);
  assert.match(center, /기존 키 값은 화면에 반환되지 않습니다/);
  assert.match(providerControl, /valueReturned:false/);
  assert.doesNotMatch(center, /secretBinding[^\n]*value/);
});

test('human-gated agent actions use the existing mission control decision endpoint', () => {
  assert.match(center, /awaiting_human/);
  assert.match(center, /\/api\/control\/ai\/actions\/\$\{id\}\/decision/);
  assert.match(agentControl, /decision은 approve 또는 reject/);
  assert.match(agentControl, /ACTION_NOT_AWAITING_HUMAN/);
});
