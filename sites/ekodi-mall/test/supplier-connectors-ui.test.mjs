import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html=readFileSync(new URL('../assets/supplier-connectors.html', import.meta.url),'utf8');
const js=readFileSync(new URL('../assets/supplier-connectors.js', import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/supplier-connectors.css', import.meta.url),'utf8');

test('task tabs each have matching hidden content and accessible names',()=>{
  for(const name of ['overview','lookup','dry-run','gates']){
    assert.match(html,new RegExp('id="connector-tab-'+name+'"[^>]*aria-controls="connector-panel-'+name+'"'));
    assert.match(html,new RegExp('id="connector-panel-'+name+'"[^>]*data-connector-panel="'+name+'"'));
  }
  assert.match(html,/role="tablist"/);
  assert.match(html,/role="tabpanel"/);
  assert.match(js,/history\.replaceState\(null,''/);
  assert.match(js,/new URLSearchParams\(location\.search\)\.get\('tab'\)/);
  assert.match(css,/\.connector-panel\[hidden\]\{display:none!important\}/);
});

test('the supplied API controls remain read-only or server safety gated',()=>{
  assert.match(html,/id="credentialSummary"/);
  assert.match(html,/id="readOnlyProbe"/);
  assert.match(html,/id="authProbeRetry"/);
  assert.match(html,/id="itemLookupForm"/);
  assert.match(html,/id="orderDryRunForm"/);
  assert.match(html,/자동발주 OFF/);
  assert.match(js,/\/api\/internal\/connectors\/domemae\/readiness/);
  assert.match(js,/\/api\/internal\/connectors\/domemae\/item-lookup/);
  assert.match(js,/\/api\/internal\/connectors\/domemae\/order-dry-run/);
  assert.match(js,/실제 주문 API는 호출하지 않았습니다/);
  assert.doesNotMatch(html,/name="password"|name="apiKey"/);
});

test('status is concise and never exposes the actor email, and login is canonical',()=>{
  assert.doesNotMatch(js,/\$\{r\.actor\}/);
  assert.match(js,/https:\/\/ekodi\.kr\/auth\//);
  assert.match(js,/return_to/);
  assert.match(js,/\.connector-panel input,\.connector-panel button/);
  assert.match(html,/aria-live="polite"/);
  assert.match(css,/@media\(max-width:520px\)/);
  assert.match(html,/id="connectorLogout"[^>]*hidden/);
  assert.match(css,/\.connector-page \.connector-actions button\[hidden\]\{display:none!important\}/);
  assert.match(js,/login\.hidden=signed;logout\.hidden=!signed/);
});
