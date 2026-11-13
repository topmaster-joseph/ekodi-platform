import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const pricing = html => html.split('<section id="web-development"')[1]?.split('<!-- Business areas above')[0] || '';

test('EKODIBIZ business homepage links to website development subscriptions without changing business routing', async () => {
  const html = await read('ekodibiz/index.html');
  assert.match(html, /href="#web-development">홈페이지 제작·구독 안내<\/a>/);
  assert.match(html, /id="web-development" class="webdev" lang="ko-KR"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/ekodi\.kr\/ekodibiz">/);
  assert.match(html, /href="https:\/\/ekodi\.kr\/ekodibiz\/refund"/);
  for (const slug of ['software', 'solar', 'mall', 'consulting', 'trade', 'publishing', 'ai-ops', 'marketing']) {
    assert.ok(html.includes('href="#business/' + slug + '"'), slug);
  }
});

test('all five proposed managed-site plans have grounded scope, an initial fee and VAT disclosure', async () => {
  const html = await read('ekodibiz/index.html');
  const section = pricing(html);
  assert.ok(section, 'public pricing section');
  assert.equal((section.match(/<article class="webdev-plan(?:\s|")/g) || []).length, 5);
  for (const [name, fee] of [
    ['라이트', '19,900원'], ['스타터', '39,900원'], ['비즈니스', '79,900원'],
    ['그로스 AI', '149,000원'], ['엔터프라이즈', '299,000원~']
  ]) {
    assert.ok(section.includes(name), name);
    assert.ok(section.includes(fee), fee);
  }
  for (const phrase of ['권장 요금안', '부가세 별도', '구축비', '간단 수정', '도메인 등록', 'AI 사용료', '월별 관리', '해지 시', '환불정책 확인']) {
    assert.ok(section.includes(phrase), phrase);
  }
  assert.match(section, /확정 판매가격·결제 청구액이 아닙니다/);
});

test('informational prices cannot directly initiate checkout and quote links are accessible', async () => {
  const section = pricing(await read('ekodibiz/index.html'));
  assert.equal((section.match(/href="mailto:ekodibiz@gmail\.com\?subject=/g) || []).length, 6);
  assert.doesNotMatch(section, /<form\b|data-checkout|checkout-intent|<button\b/i);
  assert.match(section, /aria-label="라이트 구독형 홈페이지 견적 문의"/);
  assert.match(section, /noopener noreferrer/);
  assert.match(section, /www\.imweb\.me\/price/);
  assert.match(section, /help\.pro\.sixshop\.com\/pricing-plans\/plans/);
});

test('managed-site pricing cards retain natural Korean line breaks on small screens', async () => {
  const [html, css] = await Promise.all([read('ekodibiz/index.html'), read('ekodibiz/style.css')]);
  const section = pricing(html);
  assert.doesNotMatch(section, /홈페이지, 만드는 비용보다<br>/);
  assert.match(css, /\.webdev\{[^}]*word-break:keep-all;overflow-wrap:break-word/);
  assert.match(css, /@media\(max-width:520px\)\{[^}]*\.webdev\{/);
  assert.match(css, /\.webdev-plans\{grid-template-columns:1fr\}/);
  assert.match(css, /\.webdev-plans\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});
