import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../assets/fulfillment-lab.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/fulfillment-layout.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../assets/fulfillment-lab.js',import.meta.url),'utf8');

test('fulfillment steps have a single visible accessible panel with history support',()=>{
  for(const [index,key] of ['orders','stages','policy'].entries()){
    assert.match(html,new RegExp('data-fulfillment-tab="'+key+'" id="fulfillment-tab-'+key+'" aria-controls="fulfillment-panel-'+key+'"'));
    assert.match(html,new RegExp('data-fulfillment-panel="'+key+'" id="fulfillment-panel-'+key+'" aria-labelledby="fulfillment-tab-'+key+'"'+(index?' hidden':'')));
  }
  assert.match(html,/role="tablist"/);
  assert.match(js,/function openTab\(value, writeUrl = false\)/);
  assert.match(js,/history\.replaceState\(null, ''/);
  assert.match(js,/new URLSearchParams\(location\.search\)\.get\('tab'\)/);
  assert.match(css,/\.fulfillment-panel\[hidden\]\{display:none!important\}/);
  assert.match(css,/@media\(max-width:540px\)/);
});

test('auth buttons are exclusive and log out cannot re-show stale order records',()=>{
  assert.match(html,/id="fulfillmentLogin" type="button">판매자 로그인<\/button>/);
  assert.match(html,/id="fulfillmentLogout" type="button" hidden>로그아웃<\/button>/);
  assert.match(css,/\.fulfillment-page \.fulfillment-actions button\[hidden\]\{display:none!important\}/);
  assert.match(js,/if \(login\) login\.hidden = signed/);
  assert.match(js,/if \(logout\) logout\.hidden = !signed/);
  assert.match(js,/sessionVersion\+\+; session = null; syncSessionUi\(\)/);
  assert.match(js,/version !== sessionVersion/);
  assert.match(js,/render\(\[\], false\)/);
  assert.match(js,/gatePii\.textContent = 'OFF'/);
});

test('protected read-only API and no buyer PII exposure',()=>{
  assert.match(js,/\/api\/fulfillment\/orders/);
  assert.match(js,/https:\/\/ekodi\.kr\/auth\//);
  assert.match(js,/return_to/);
  assert.match(html,/구매자 개인정보 원문 미노출/);
  assert.match(html,/id="fulfillmentList"/);
  assert.match(html,/id="fulfillmentCount"/);
  assert.match(html,/id="gatePii"/);
  assert.match(html,/id="gateForward"/);
  assert.doesNotMatch(html,/name="password"|name="apiKey"/);
  assert.doesNotMatch(js,/(POST|PUT|DELETE)\s*['"]|method:\s*['"](POST|PUT|DELETE)/);
});
