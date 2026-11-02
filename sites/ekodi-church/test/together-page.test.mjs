import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../together/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../together/together.js', import.meta.url), 'utf8');
const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const headers = readFileSync(new URL('../_headers', import.meta.url), 'utf8');

test('together page states receipt eligibility per organization', () => {
  assert.match(html, /<h3>에코디교회<\/h3><span class="badge ok">기부금영수증 발급 가능<\/span>[\s\S]*307-82-82097/);
  assert.match(html, /<h3>에코디선교회<\/h3><span class="badge muted">기부금영수증 발급 불가<\/span>[\s\S]*120-82-72255/);
});

test('together page uses only same-origin scripts (CSP script-src self)', () => {
  const srcs = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.length > 0);
  for (const s of srcs) assert.ok(s.startsWith('/'), s);
  assert.doesNotMatch(html, /<script(?![^>]*(src=|application\/ld\+json))[^>]*>/);
  assert.match(headers, /form-action 'self'/);
});

test('form posts to standing mission application API and shows completion + contact', () => {
  assert.match(js, /\/ekodimission\/api\/activities\/261028-together-partners\/applications/);
  assert.match(js, /정상 접수되었습니다/);
  assert.match(js, /010-3501-8542/);
  assert.match(html, /name="privacy" required/);
  assert.match(html, /name="website"/); // honeypot
});

test('card giving only opens trusted missionfund host', () => {
  assert.match(js, /hostname === 'go\.missionfund\.org'/);
  assert.match(js, /noopener,noreferrer/);
});

test('homepage links to together page', () => {
  assert.match(home, /href="\/ekodichurch\/together\/">함께하기</);
});

test('header and content share one centered measure', () => {
  const css = readFileSync(new URL('../together/together.css', import.meta.url), 'utf8');
  assert.match(css, /\.site-header\{[^}]*padding:0 max\(var\(--tg-gutter\),calc\(\(100% - var\(--tg-w\)\) \/ 2\)\)/);
  assert.match(css, /\.together-wrap\{width:min\(var\(--tg-w\),100% - var\(--tg-gutter\) \* 2\)/);
  assert.match(css, /\.together-main\{[^}]*text-align:center/);
  assert.equal((html.match(/class="together-wrap"/g) || []).length, 5);
});

test('three ways are buttons that reveal their detail below', () => {
  assert.equal((html.match(/class="together-way" role="tab"/g) || []).length, 3);
  for (const id of ['pray', 'give', 'join']) assert.match(html, new RegExp(`id="${id}" role="tabpanel"`));
  assert.match(js, /sections\.forEach\(section => \{ section\.hidden = !panels\[way\]\.includes\(section\.id\); \}\)/);
});

test('every church page shares the homepage header/footer and a fixed header', () => {
  const shell = readFileSync(new URL('../church-shell.js', import.meta.url), 'utf8');
  assert.match(shell, /header\.site-header #main-nav/);assert.match(shell, /footer\[data-ekodi-service-footer\]/);
  assert.match(shell, /\['position', 'fixed'\]/);assert.match(shell, /church-shell-spacer/);
  assert.match(html, /\/ekodichurch\/church-shell\.js/);assert.match(home, /church-shell\.js/);
  const devotion = readFileSync(new URL('../devotion/index.html', import.meta.url), 'utf8');
  assert.match(devotion, /\/ekodichurch\/church-shell\.js/);
  new Function(shell);
});
