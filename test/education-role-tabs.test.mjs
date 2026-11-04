import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const home=read('../education/index.html');
const tabs=read('../education/edu-role-tabs.js');
const style=read('../education/edu-role-tabs.css');
const app=read('../education/app.js');

test('education homepage ships default-hidden role surface and tab assets',()=>{
  assert.match(home,/data-edu-view="pending"/);
  assert.match(home,/edu-role-tabs\.css/);
  assert.match(home,/edu-role-tabs\.js/);
  assert.match(style,/data-edu-view="pending"/);
  assert.match(style,/\[data-edu-panel\]\[hidden\]/);
});
test('member dashboard is hidden for guests and available for authenticated session',()=>{
  assert.match(tabs,/authenticated\?'mine':'explore'/);
  assert.match(tabs,/!\['mine'\]\.includes/);
  assert.match(tabs,/authenticated=Boolean\(event\.detail\?\.authenticated\)/);
  assert.match(app,/EKODI_EDU_SESSION=\{authenticated:Boolean\(enabled&&session\)/);
});
test('education tabs preserve existing routes and avoid role-based API privilege changes',()=>{
  for(const tab of ['mine','explore','courses','community','support'])assert.ok(tabs.includes("'"+tab+"'"));
  assert.match(tabs,/setAttribute\('aria-pressed'/);
  assert.match(tabs,/hashchange/);
  assert.match(home,/href="\/admission"/);
  assert.match(home,/href="\/study"/);
});

test('auth-dependent dashboard is not rendered before verified session',()=>{
  assert.match(app,/if\(area==='home'&&!session\)/);
  assert.match(app,/try\{await refreshSession\(\)\}/);
  assert.match(app,/else\{renderIdentity\(\);renderAll\(\)\}/);
  assert.match(tabs,/guestSummary.hidden=authenticated/);
  assert.match(tabs,/addEventListener\('load'/);
});
