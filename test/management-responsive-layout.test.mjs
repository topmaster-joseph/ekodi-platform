import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../management/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../management/styles.css',import.meta.url),'utf8');
const marker='MANAGEMENT-RESPONSIVE-20261112';
const adaptive=css.split(marker)[1]||'';

test('management entry retains responsive viewport and actionable member controls',()=>{
  assert.match(html,/<meta name="viewport" content="width=device-width,initial-scale=1">/);
  for(const id of ['memberApp','verifiedSpacesList','selectedWorkspaceStatus','memberModuleGrid',
    'managementRequest','routeRequest','logoutButton']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
});

test('layout provides desktop, tablet, phone, and narrow phone arrangements',()=>{
  assert.ok(adaptive.length>2500,'adaptive layout must not be missing');
  assert.match(adaptive,/\.hero h1, \.member-head h1\s*\{/);
  assert.match(adaptive,/font-size: clamp\(1\.95rem, 4\.4vw, 3\.45rem\)/);
  assert.match(adaptive,/@media \(min-width: 1180px\)/);
  assert.match(adaptive,/@media \(max-width: 1023px\)/);
  assert.match(adaptive,/@media \(max-width: 899px\)/);
  assert.match(adaptive,/@media \(max-width: 600px\)/);
  assert.match(adaptive,/@media \(max-width: 359px\)/);
  assert.match(adaptive,/\.panel-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(adaptive,/\.store-operation-tabs \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \}/);
  assert.match(adaptive,/\.store-operation-tabs \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
});

test('responsive refinements retain touch and keyboard access without hiding critical panels',()=>{
  for(const item of ['.store-operation-tab { min-height: 42px; }',
    '.module-choice:focus-within','@media (prefers-reduced-motion: reduce)',
    '.verified-space > * { max-width: 100%; }']){
    assert.ok(adaptive.includes(item),item);
  }
  assert.doesNotMatch(adaptive,/\.member-app\s*\{[^}]*display\s*:\s*none/s);
  assert.doesNotMatch(adaptive,/\.store-operations\s*\{[^}]*display\s*:\s*none/s);
  assert.doesNotMatch(adaptive,/\.topbar\s+nav\s*\{[^}]*display\s*:\s*none/s);
});
