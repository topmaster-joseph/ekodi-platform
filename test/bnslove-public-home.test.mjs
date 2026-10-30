import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderBnslovePublicPage } from '../bnslove-public-page.js';

test('Bnslove public home is guest-readable and retains the canonical workspace root', async () => {
  const response = renderBnslovePublicPage();
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('x-ekodi-route'), 'bnslove-public');
  assert.match(html, /<html lang="ko"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/ekodi\.kr\/bnslove\/"/);
  for (const marker of ['형제사랑회', 'id="about"', 'id="activities"', 'id="meetings"', 'id="notices"', 'id="participate"', 'href="/bnslove/admin"']) {
    assert.ok(html.includes(marker), marker);
  }
  assert.match(html, /return_to=https%3A%2F%2Fekodi\.kr%2Fbnslove%2F/);
  assert.doesNotMatch(html, /tenant_admin|api[_-]?key|service_role|개인별 출석|관리자 이메일/);
  assert.doesNotMatch(html, /<script|onfocus=|onblur=|onclick=/);
});

test('Bnslove public route is isolated from other workspace and admin paths', () => {
  const worker = fs.readFileSync(new URL('../space-worker.js', import.meta.url), 'utf8');
  const guardedRoute = /if\(requested==='bnslove'&&!workspaceRoute\?\.service\)/;
  assert.match(worker, guardedRoute);
  assert.match(worker, /renderBnslovePublicPage\(\)/);
  assert.match(worker, /if\(isOrganizationWorkspaceSlug\(requested\)&&!workspaceRoute\?\.service\)/);
  assert.match(worker, /return appShell\(request,env,workspaceRoute\?\.service/);
});

test('Bnslove mobile and accessibility boundaries are included', async () => {
  const html = await renderBnslovePublicPage().text();
  assert.match(html, /@media\(max-width:640px\)/);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html, /class="skip-link" href="#main"/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /<main id="main">/);
  assert.match(html, /<nav class="nav" aria-label=/);
  assert.match(html, /등록된 공개 활동 자료가 없습니다/);
  assert.match(html, /공개된 모임 일정이 없습니다/);
});
