import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const center = readFileSync(new URL('../ai-operations-center-admin.js', import.meta.url), 'utf8');
const menu = readFileSync(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');
const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const providerControl = readFileSync(new URL('../ai-provider-control.js', import.meta.url), 'utf8');
const adminProviderControl = readFileSync(new URL('../admin-provider-control.js', import.meta.url), 'utf8');
const agentControl = readFileSync(new URL('../ai-agent-control.js', import.meta.url), 'utf8');

test('AI operations center source parses as JavaScript', () => {
  assert.doesNotThrow(() => new Function(center));
});

test('AI operations center remains loaded while the visible status menu uses incident language', () => {
  assert.match(menu, /id: 'aiops'[^\n]*group: 'status'[^\n]*ko: '장애·오류·경고'[^\n]*en: 'Incidents, Errors & Warnings'/);
  assert.match(menu, /id: 'openai'[^\n]*group: 'services'[^\n]*en: 'OpenAI'[^\n]*internal: true/);
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
  assert.match(center, /Cloudflare → Gemini Free → OpenRouter Free → Groq Free → OpenAI 승인 → Claude 승인/);
  assert.match(providerControl, /PROVIDERS=new Set\(\['gemini','openrouter','groq','openai','anthropic'\]\)/);
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


test('provider cards expose direct key setup links and block health checks until a secret is connected', () => {
  assert.match(adminProviderControl, /aistudio\.google\.com\/app\/apikey/);
  assert.match(adminProviderControl, /platform\.openai\.com\/api-keys/);
  assert.match(adminProviderControl, /platform\.claude\.com\/settings\/keys/);
  assert.match(adminProviderControl, /providerActionHint/);
  assert.match(adminProviderControl, /data-ai-action="check" \$\{configured\?'':'disabled'\}/);
  assert.match(adminProviderControl, /API Key 연결 필요/);
});


test('provider key entry survives secret-manager bootstrap failures and surfaces the exact setup path', () => {
  assert.match(adminProviderControl, /providerControlErrorMessage/);
  assert.match(adminProviderControl, /Secret Manager 연결 필요/);
  assert.match(adminProviderControl, /CLOUDFLARE_SECRET_MANAGER_TOKEN/);
  assert.match(adminProviderControl, /dash\.cloudflare\.com\/profile\/api-tokens/);
  assert.match(adminProviderControl, /github\.com\/topmaster-joseph\/ekodi-platform\/settings\/secrets\/actions/);
  assert.doesNotMatch(adminProviderControl, /catch\(e\)\{input\.value=''\;message\(card,e\.message,true\)\}/);
});


test('free-first execution chain is visible in the AI operations center',()=>{
  for(const marker of ['cloudflare-workers-ai','OpenRouter Free','Groq Free','유료 승인','자동 Failover','Human Gate']) assert.match(center,new RegExp(marker));
});
