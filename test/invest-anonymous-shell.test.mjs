// INVEST-ANON-LAYOUT-REBASE-20261112: anonymous owner login must not occupy the hidden sidebar track.
import test from 'node:test';
import assert from 'node:assert/strict';
import { investMyRoute } from '../invest-my-workspace.js';

const response = await investMyRoute(new Request('https://ekodi.kr/invest/my'), {});
assert.equal(response.status, 200, 'anonymous page must remain available');
const html = await response.text();

test('anonymous owner page starts with sidebar hidden, login content visible', () => {
  assert.match(html, /<nav id="ownerSidebar"[^>]* hidden>/);
  assert.match(html, /class="invest-auth-intro"/);
  assert.match(html, /id="investAuthIntro"/);
});

test('layout frees hidden sidebar column but keeps authenticated layout unchanged', () => {
  assert.match(html, /\.shell:has\(> #ownerSidebar\[hidden\]\)\{display:block\}/);
  assert.match(html, /\.shell:has\(> #ownerSidebar\[hidden\]\) > \.main\{[^}]*max-width:640px/);
  assert.match(html, /\.shell\{display:grid;/, 'authenticated shell retains its original grid');
});

test('anonymous Korean text stays intact across viewports', () => {
  assert.match(html, /\.shell:has\(> #ownerSidebar\[hidden\]\) \.invest-auth-intro\{[^}]*word-break:keep-all;overflow-wrap:normal/);
  assert.match(html, /\.shell:has\(> #ownerSidebar\[hidden\]\) \.auth\{[^}]*flex-wrap:wrap/);
  assert.match(html, /\.shell:has\(> #ownerSidebar\[hidden\]\) \.auth a\{[^}]*white-space:nowrap/);
});

test('phone login CTA flows full-width while desktop uses centered content', () => {
  assert.match(html, /@media\(max-width:480px\)\{\.shell:has\(> #ownerSidebar\[hidden\]\)[^}]*\.invest-auth-intro\{padding:20px\}/);
  assert.match(html, /\.shell:has\(> #ownerSidebar\[hidden\]\) \.auth a\{width:100%\}/);
});

test('fix remains UI-only with no live-trade enablement', () => {
  assert.match(html, /실계좌 자동주문은 별도 승인 전 차단됩니다/);
});
