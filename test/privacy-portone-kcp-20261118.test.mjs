import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeSinglesSurface } from '../singles-surface.js';
test('공통 개인정보처리방침에 포트원·NHN KCP 처리위탁 고지(v1.1)', () => {
  const html = readFileSync(new URL('../privacy.html', import.meta.url), 'utf8');
  assert.match(html, /㈜코리아포트원\(PortOne\)/);
  assert.match(html, /엔에이치엔케이씨피㈜\(NHN KCP\)/);
  assert.match(html, /공개 기본정책 v1\.1/);
});
test('동행 개인정보 안내에 본인인증 위탁 고지', async () => {
  const env={ASSETS:{fetch:async()=>new Response('x')}};
  const html = await (await routeSinglesSurface(new Request('https://ekodi.kr/singles/privacy'), env)).text();
  assert.ok(html.includes('㈜코리아포트원') && html.includes('NHN KCP'));
});
