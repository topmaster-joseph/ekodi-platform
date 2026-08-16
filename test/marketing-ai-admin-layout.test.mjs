import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const js = readFileSync(new URL('../marketing-ai-admin.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../marketing-ai-admin.css', import.meta.url), 'utf8');

test('MarketingAI admin is an operations console with a separate user entry', () => {
  assert.match(js, /button\.dataset\.section = 'marketing-ai'/);
  assert.match(js, /Marketing AI 운영 관제센터/);
  assert.match(js, /OPERATIONS CONSOLE/);
  assert.ok(js.includes('href="${LIVE}" target="_blank"'));
  assert.match(js, /사용자 페이지 ↗/);
  assert.doesNotMatch(js, /marketingAiAdminFrame/);
  assert.doesNotMatch(js, /<iframe/i);
  assert.doesNotMatch(css, /marketing-ai-frame-/);
});

test('MarketingAI admin exposes scalable internal operation tabs', () => {
  for (const tab of ['overview','customers','workspaces','campaigns','crm','channels','automation','approvals','billing','reports']) {
    assert.match(js, new RegExp(`['\"]${tab}['\"]`));
  }
  assert.match(css, /\.marketing-ai-console-tabs/);
  assert.match(css, /\.marketing-ai-console-view/);
  assert.match(css, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
});

test('MarketingAI admin uses real admin aggregates and marks unconnected contracts honestly', () => {
  assert.match(js, /\/api\/marketing\/admin\/overview/);
  assert.match(js, /\/api\/membership\/admin\/subscriptions/);
  assert.match(js, /\/api\/membership\/admin\/charges/);
  assert.match(js, /DATA CONTRACT NOT CONNECTED/);
  assert.match(js, /연결 전에는 0을 실제 성과처럼 표시하지 않습니다/);
  assert.match(js, /READ-ONLY OPS · 외부 자동실행 없음/);
});
