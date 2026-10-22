import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const provider = readFileSync(new URL('../admin-provider-control.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../admin-readable-command.css', import.meta.url), 'utf8');

test('AI operations center exposes five accessible tabs without duplicate service panel', () => {
  assert.match(provider, /\['operations','운영 현황'\]/);
  assert.match(provider, /\['connections','공급자·계정'\]/);
  assert.match(provider, /\['routing','자동 라우팅'\]/);
  assert.match(provider, /\['logs','실행·감사 기록'\]/);
  assert.match(provider, /\['services','외부 서비스'\]/);
  assert.match(provider, /role="tablist"/);
  assert.match(provider, /role="tabpanel"/);
  assert.match(provider, /aria-selected="\$\{aiView===id\}"/);
  assert.match(provider, /tabindex="\$\{aiView===id\?0:-1\}"/);
  assert.match(provider, /ArrowLeft','ArrowRight','Home','End/);
  assert.match(provider, /wrap\.innerHTML=withAi\?aiPanel\(\):infraPanel\(\)/);
  assert.doesNotMatch(provider, /wrap\.innerHTML=\x60\$\{withAi\?aiPanel\(\):''\}\$\{infraPanel\(\)\}\x60/);
  assert.match(provider, /aiView==='services'&&!aiOps\.querySelector/);
});

test('AI center width and tabs are scoped to visible AI Ops; mobile remains usable', () => {
  assert.match(css, /AI-CENTER-WIDE-TABBED-WORKSPACE-20261023/);
  assert.match(css, /\.content:has\(#aiOpsPanel:not\(\.hidden-panel\)\)/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /overflow-x:auto!important/);
  assert.match(css, /grid-template-columns:1fr!important/);
});

test('existing provider safety and secret handling stay unchanged', () => {
  for (const marker of [
    "const AI_ADMIN='/api/ai-modules/v1/providers/admin'",
    "headers:{'x-ekodi-confirm-impact':'ai-provider-secret-connect'}",
    "headers:{'x-ekodi-confirm-impact':'ai-provider-route-update'}",
    "headers:{'x-ekodi-confirm-impact':'ai-provider-runtime-update'}",
    "type=\"password\"",
    "유료 자동 전환은 금지됩니다."
  ]) assert.ok(provider.includes(marker), marker);
  assert.doesNotMatch(provider, /localStorage/);
});
