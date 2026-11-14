import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');
const home = read('my/index.html');
const points = read('my/points/index.html');
const css = read('my/hub-shell.css');

test('My EKODI home and points use the same versioned centered chrome stylesheet',()=>{
  const asset = '/my/hub-shell.css?v=20261114-unified-my-width-v1';
  assert.ok(home.includes(asset));
  assert.ok(points.includes(asset));
  assert.match(home,/<header class="topbar my-comfort-header">/);
  assert.match(home,/<main id="home" class="my-tab-shell">/);
  assert.match(home,/<footer class="my-custom-footer"/);
  assert.match(home,/class="my-desktop-tabs"/);
  assert.match(home,/class="my-footer-inner"/);
  assert.match(home,/class="my-footer-credo"/);
  assert.match(home,/class="my-footer-copyright">© EKODI/);
});

test('header, contextual menus, central panels and both footers use one width/gutter variable',()=>{
  assert.match(css,/--my-content-max:1180px/);
  assert.match(css,/--my-content-width:min\(var\(--my-content-max\),calc\(100% - 36px\)\)/);
  assert.match(css,/--my-content-gutter:max\(18px,calc\(\(100% - var\(--my-content-max\)\)\/2\)\)/);
  assert.match(css,/\.topbar\.my-comfort-header\{[\s\S]*?padding-inline:var\(--my-content-gutter\)!important/);
  assert.match(css,/\.my-custom-footer \.my-footer-inner\{[\s\S]*?width:var\(--my-content-width\)/);
  assert.match(css,/\.my-custom-footer \.my-footer-credo\{[\s\S]*?padding-inline:var\(--my-content-gutter\)/);
  assert.match(css,/html\[data-ekodi-user-ui\] \.ekodi-user-ui-footer__inner\{[\s\S]*?width:var\(--my-content-width\)!important/);
  assert.match(css,/main#home\.my-tab-shell > :is\(\.section\.my-tab-section,\.summary\.my-tab-section,\.services-subtabs\.my-tab-section\)\{[\s\S]*?width:var\(--my-content-width\)/);
  assert.match(css,/main#home\.my-tab-shell > :is\(\.section\.my-tab-section:not\(\.member-context-home\):not\(\.section-wayfinder\),\.summary\.my-tab-section\)\{[\s\S]*?padding-inline:0/);
});

test('responsive envelope remains centered at phone, tablet and desktop reference widths',()=>{
  for (const viewport of [320,390,768,1366,1440]){
    const width=Math.min(1180,viewport-36);
    const gutter=Math.max(18,(viewport-1180)/2);
    assert.ok(width>0);
    assert.equal(width+2*gutter,viewport, 'balanced content gutters at '+viewport);
    assert.ok(width<=viewport-36,'safe minimum margins at '+viewport);
  }
  assert.doesNotMatch(css,/word-break:\s*break-all/);
  assert.match(css,/Keep authored full-bleed welcome\/soft sections and padded action cards intact/);
});

test('signed-out protection, main menu routing and existing footer copy remain intact',()=>{
  assert.match(home,/data-auth-state="guest"/);
  for(const route of ['home','services','activity','account']){
    assert.match(home,new RegExp('data-my-tab-link="'+route+'"'));
  }
  assert.match(css,/body\[data-auth-state="guest"\]>\*,body\[data-auth-state="redirect"\]>\*\{visibility:hidden!important\}/);
  assert.match(home,/class="my-footer-note"/);
  assert.match(home,/class="my-footer-copyright"/);
  assert.doesNotMatch(home,/data-ekodi-global-nav="on"/);
});
