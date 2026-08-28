import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Native merge release marker: 2026-08-29 final production verification.
const js = readFileSync(new URL('../marketing-ai-admin-posting-status.js', import.meta.url), 'utf8');
const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');

test('posting status is an authenticated Marketing admin subview', () => {
  assert.match(js, /TAB_KEY = 'publications'/);
  assert.match(js, /data\.marketingTab = TAB_KEY/);
  assert.match(js, /포스팅 현황/);
  assert.match(js, /\/api\/marketing\/admin\/overview/);
  assert.match(js, /authorization/);
});

test('posting ledger derives only stored campaign and audit state', () => {
  assert.match(js, /automationActions/);
  assert.match(js, /campaigns/);
  assert.match(js, /POSTING_ACTION_RE/);
  assert.match(js, /publicationRows/);
  assert.match(js, /작성중/);
  assert.match(js, /예약/);
  assert.match(js, /게시완료/);
  assert.match(js, /실패/);
  assert.match(js, /재시도/);
  assert.match(js, /수집 전/);
  assert.match(js, /외부 게시 성공을 확인하지 못한 항목을 임의로/);
});

test('posting view does not execute or mutate external channels', () => {
  assert.doesNotMatch(js, /method\s*:\s*['"]POST['"]/);
  assert.doesNotMatch(js, /method\s*:\s*['"]PUT['"]/);
  assert.doesNotMatch(js, /method\s*:\s*['"]DELETE['"]/);
  assert.match(js, /postingPublisher\?\.connected/);
  assert.match(js, /Metricool \/ 게시 실행자/);
  assert.match(js, /게시 어댑터 연결 대기/);
});

test('posting status is bundled into the existing on-demand Marketing admin asset', () => {
  assert.match(build, /marketing-ai-admin-posting-status\.js/);
  assert.match(build, /marketingPostingStatusJs/);
  assert.match(build, /Marketing posting status marker missing/);
  assert.match(build, /\$\{marketingPostingStatusJs\}/);
});
