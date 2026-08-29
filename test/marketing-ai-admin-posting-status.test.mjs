import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const js = readFileSync(new URL('../marketing-ai-admin-posting-status.js', import.meta.url), 'utf8');
const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');

test('posting status is an authenticated Marketing admin subview', () => {
  assert.match(js, /TAB_KEY = 'publications'/);
  assert.match(js, /dataset\.marketingTab = TAB_KEY/);
  assert.match(js, /포스팅 현황/);
  assert.match(js, /\/api\/marketing\/admin\/overview/);
  assert.match(js, /authorization/);
});

test('posting ledger prefers authoritative publication jobs and real external post urls', () => {
  assert.match(js, /actualPublicationRows/);
  assert.match(js, /data\?\.publicationJobs/);
  assert.match(js, /externalPostUrl/);
  assert.match(js, /postingEngine/);
  assert.match(js, /scheduledPublications/);
  assert.match(js, /publishedPublications/);
  assert.match(js, /failedPublications/);
  assert.match(js, /retryingPublications/);
  assert.match(js, /게시 대기/);
  assert.match(js, /게시중/);
  assert.match(js, /게시완료/);
  assert.match(js, /인증 필요/);
  assert.match(js, /재시도/);
  assert.match(js, /수집 전/);
  assert.match(js, /실제 publication job 원장을 우선 사용합니다/);
});

test('posting ledger keeps rollout fallback but never mutates external channels', () => {
  assert.match(js, /fallbackPublicationRows/);
  assert.match(js, /automationActions/);
  assert.match(js, /campaigns/);
  assert.match(js, /POSTING_ACTION_RE/);
  assert.doesNotMatch(js, /method\s*:\s*['"]POST['"]/);
  assert.doesNotMatch(js, /method\s*:\s*['"]PUT['"]/);
  assert.doesNotMatch(js, /method\s*:\s*['"]DELETE['"]/);
  assert.match(js, /게시 실행 엔진/);
  assert.match(js, /활성 게시 채널 없음/);
  assert.match(js, /외부 게시 성공을 확인하지 못한 항목을 임의로/);
});

test('posting status is bundled into the existing on-demand Marketing admin asset', () => {
  assert.match(build, /marketing-ai-admin-posting-status\.js/);
  assert.match(build, /marketingPostingStatusJs/);
  assert.match(build, /Marketing posting status marker missing/);
  assert.match(build, /\$\{marketingPostingStatusJs\}/);
});
