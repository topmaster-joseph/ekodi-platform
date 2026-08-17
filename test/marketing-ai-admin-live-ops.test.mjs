import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const js = readFileSync(new URL('../marketing-ai-admin-live-ops.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../marketing-ai-admin-live-ops.css', import.meta.url), 'utf8');
const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');

test('live Marketing admin views reuse the authenticated overview endpoint', () => {
  assert.match(js, /\/api\/marketing\/admin\/overview/);
  assert.match(js, /new Set\(\['campaigns','crm','channels','automation','approvals'\]\)/);
  assert.match(js, /CAMPAIGN LEDGER/);
  assert.match(js, /CRM RELATIONSHIP LEDGER/);
  assert.match(js, /CHANNEL REGISTRY/);
  assert.match(js, /AI AUTOMATION/);
  assert.match(js, /HUMAN GATE/);
});

test('live Marketing admin views remain observation-only and do not expose customer keys', () => {
  assert.doesNotMatch(js, /method\s*:\s*['"]POST['"]/);
  assert.doesNotMatch(js, /method\s*:\s*['"]PUT['"]/);
  assert.doesNotMatch(js, /\/decision/);
  assert.match(js, /승인 현황만 보여줍니다/);
  assert.match(js, /감사·관찰용/);
  assert.match(js, /customer_key조차 포함하지 않습니다/);
});

test('build bundles live ops into existing authenticated Marketing admin assets', () => {
  assert.match(build, /marketing-ai-admin-live-ops\.js/);
  assert.match(build, /marketing-ai-admin-live-ops\.css/);
  assert.match(build, /writeFile\(`\$\{output\}marketing-ai-admin\.js`/);
  assert.match(build, /writeFile\(`\$\{output\}marketing-ai-admin\.css`/);
  assert.match(css, /\.marketing-ai-approval-layout/);
  assert.match(css, /\.marketing-ai-channel-groups/);
  assert.match(css, /\.marketing-ai-campaign-list/);
  assert.match(css, /\.marketing-ai-crm-grid/);
});
