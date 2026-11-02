import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../devotion/index.html', import.meta.url), 'utf8');
const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../script.js', import.meta.url), 'utf8');

test('church devotion page is titled 오늘의 매일묵상 and mounts the shared EKODI renderer', () => {
  assert.match(page, /<h1>오늘의 매일묵상<\/h1>/);
  assert.match(page, /<title>오늘의 매일묵상 \| 에코디교회<\/title>/);
  assert.match(page, /data-ekodi-devotion data-base="\/ekodichurch\/devotion\/" data-date-mode="query" data-site-label="에코디교회"/);
  assert.match(page, /<script type="module" src="\/bible\/devotion\.js"><\/script>/);
  assert.match(page, /href="\/bible\/devotion\.css"/);
  assert.match(page, /property="og:title" content="오늘의 매일묵상 · 에코디교회"/);
});

test('church devotion page uses the church header and footer', () => {
  assert.match(page, /<header class="site-header church-devotion-header"/);
  assert.match(page, /<a class="brand" href="\/ekodichurch\/"/);
  assert.match(page, /aria-current="page" class="nav-devotion">매일묵상<\/a>/);
  assert.match(page, /<footer class="site-footer church-footer" data-ekodi-service-footer>/);
  assert.match(page, /고유번호 307-82-82097/);
});

test('church devotion page ships no inline script (script-src self)', () => {
  assert.doesNotMatch(page, /<script(?![^>]*src=)[^>]*>/);
});

test('homepage and runtime header link to the devotion page before QTIN', () => {
  const nav = home.slice(home.indexOf('<nav id="main-nav"'), home.indexOf('</nav>', home.indexOf('<nav id="main-nav"')));
  assert.ok(nav.includes('<a class="nav-devotion" href="/ekodichurch/devotion/">매일묵상</a>'));
  assert.ok(nav.indexOf('nav-devotion') < nav.indexOf('nav-qtin'));
  assert.ok(script.includes("{ href: '/ekodichurch/devotion/', label: '매일묵상', className: 'nav-devotion' }"));
  assert.ok(script.indexOf("'/ekodichurch/devotion/'") < script.indexOf("'/qtin/church'"));
});

test('devotion header spans the centre column and tabs are not offset onto the panel', () => {
  const css = readFileSync(new URL('../devotion/devotion.css', import.meta.url), 'utf8');
  assert.match(css, /--dv-column:840px/);
  assert.match(css, /padding-inline:max\(16px,calc\(\(100% - var\(--dv-column\)\)\/2 \+ 16px\)\)/);
  assert.doesNotMatch(css, /\.dv-tabs\{top:/);
});

test('church devotion page advertises the EKODI share card for KakaoTalk previews', () => {
  assert.match(page, /og:image" content="https:\/\/ekodi\.kr\/bible\/og\/devotion\.jpg"/);
  assert.match(page, /twitter:card" content="summary_large_image"/);
});
