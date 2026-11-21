import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../office-prototype/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../office-prototype/office.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../office-prototype/office.css', import.meta.url), 'utf8');

const TRUSTED_OUTBOUND = new Set([
  'https://github.com/pblsketch/ieumoffice',
  'https://github.com/genspark-ai/genoffice',
  'https://www.apache.org/licenses/LICENSE-2.0',
  'https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites',
  'https://openrouter.ai/docs/guides/overview/auth/oauth',
  'https://ai.google.dev/gemini-api/docs/pricing',
]);
test('honest connected-only office hub and documented source provenance', () => {
  assert.match(html, /오피스 통합 진입점 · 연결 서비스 제공/);
  assert.match(html, /실제 파일을 열거나 저장하지 않습니다/);
  assert.match(html, /설치 가능한 EKODI Office 프로그램이 없습니다/);
  assert.match(html, /직접 연결 · 구축 예정/);
  for (const route of ['/my/docs/', '/proposal/', '/edu/', '/my/']) {
    assert.ok(html.includes('https://ekodi.kr' + route), route);
  }
  for (const route of ['#tools','#ai-connect','#workspace','#sources']) {
    assert.ok(html.includes('href="'+route+'"') && html.includes('id="'+route.slice(1)+'"'), route);
  }
  for (const href of TRUSTED_OUTBOUND) {
    assert.ok(html.includes('href="'+href+'"'), 'source disclosure '+href);
  }
  assert.doesNotMatch(html, /office\.ekodi\.kr|구현 완료|지금 다운로드/);
});
test('external source links are precisely allowlisted, with noopener', () => {
  const anchors = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)];
  assert.ok(anchors.length >= 20);
  for (const [,href] of anchors) {
    if (href.startsWith('#')) continue;
    const parsed=new URL(href);
    assert.equal(parsed.protocol,'https:',href);
    if (parsed.hostname==='ekodi.kr') continue;
    assert.ok(TRUSTED_OUTBOUND.has(href),'unapproved external origin: '+href);
    const tag=anchors.find(a=>a[1]===href)?.[0]||'';
    assert.match(tag,/target="_blank"/);
    assert.match(tag,/rel="noopener noreferrer"/);
  }
});
test('strict static-only surface never accepts keys, passwords, uploads or network calls', () => {
  assert.doesNotMatch(html, /<form\b|<input\b|<textarea\b|type="file"|<script(?!\s+defer\s+src="\.\/office\.js")/i);
  assert.doesNotMatch(js, /\b(fetch|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|postMessage|sendBeacon)\b/);
  assert.doesNotMatch(js, /innerHTML|eval\s*\(|new Function/);
  assert.doesNotMatch(html, /on(click|load|error|input)=/i);
  assert.doesNotMatch(html, /<iframe\b|<object\b|<embed\b/i);
});
test('AI guidance explicitly separates free, subscription and tenant API billing', () => {
  for (const concept of [
    'OpenRouter', 'Gemini', 'ChatGPT', 'Claude Code', 'Codex',
    '무료는 무제한이 아닙니다', '개인 요금제 허용 한도', 'API·인프라 비용 별도',
    '개인 ChatGPT 구독 사용 권한', '기관형 서비스에 자동 적용하지 않습니다',
    '사용자 결정', '제공자에게 전송될 수 있습니다'
  ]) assert.ok(html.includes(concept),concept);
});
test('licenses and code attribution are transparent without false ownership claims', () => {
  for (const concept of [
    'EKODI Office','IeumOffice','GenOffice','Apache 2.0',
    'LICENSE','NOTICE','제3자 라이선스','상표·로고',
    '자동으로 Apache 2.0이 되는 것은 아닙니다',
    '이음오피스 데스크톱 엔진을 내장한 제품이 아닙니다',
  ]) assert.ok(html.includes(concept),concept);
});
test('accessible 3-tab workspace navigation and keyboard operation are preserved', () => {
  for (const key of ['personal', 'team', 'desktop']) {
    assert.match(html, new RegExp('id="tab-' + key + '"'));
    assert.match(html, new RegExp('id="panel-' + key + '"'));
    assert.match(html, new RegExp('data-tab="' + key + '"'));
  }
  for (const name of ['aria-selected','ArrowRight','ArrowLeft','Home','End']) assert.ok(js.includes(name),name);
  assert.match(html, /<nav class="head-nav" aria-label="페이지 메뉴">/);
  assert.match(html, /class="skip" href="#main"/);
  assert.match(html, /<details>/);
  assert.match(css, /max-width:600px/);
  assert.match(css, /max-width:360px/);
  assert.match(css, /prefers-reduced-motion/);
});
