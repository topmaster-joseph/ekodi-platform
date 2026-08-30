import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const js = readFileSync(new URL('../marketing-ai-admin-live-ops.js', import.meta.url), 'utf8');
const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');

test('Marketing operations exposes the six canonical execution tabs', () => {
  for (const marker of [
    "['overview','개요']",
    "['content','콘텐츠']",
    "['channels','채널 연결']",
    "['publishing','예약·게시']",
    "['performance','성과']",
    "['improvement','AI 개선']",
  ]) assert.match(js, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(js, /마케팅 운영/);
  assert.match(js, /MARKETING OPERATIONS/);
});

test('Marketing operations uses authenticated direct social gateway actions', () => {
  assert.match(js, /\/api\/control\/social\/registry/);
  assert.match(js, /\/api\/control\/social\/content\/generate/);
  assert.match(js, /\/api\/control\/social\/oauth\//);
  assert.match(js, /\/api\/control\/social\/connections/);
  assert.match(js, /\/api\/control\/social\/posts/);
  assert.match(js, /\/api\/control\/social\/performance/);
  assert.match(js, /\/api\/control\/social\/metrics\/sync/);
  assert.match(js, /method:'POST'/);
  assert.match(js, /method:'DELETE'/);
  assert.match(js, /플랫폼의 실제 응답을 확인해 게시 결과를 기록했습니다/);
});

test('Marketing operations never embeds provider secrets or customer PII keys', () => {
  for (const secret of ['META_APP_SECRET','GOOGLE_CLIENT_SECRET','SOCIAL_TOKEN_KEY','customer_key']) {
    assert.doesNotMatch(js, new RegExp(secret));
  }
  assert.match(js, /Bearer \$\{token\(\)\}/);
  assert.match(js, /Access Token이나 Page ID를 복사해 넣지 않습니다/);
});

test('build bundles Marketing operations into the authenticated Marketing admin asset', () => {
  assert.match(build, /marketing-ai-admin-live-ops\.js/);
  assert.match(build, /marketing-ai-admin-live-ops\.css/);
  assert.match(build, /writeFile\(`\$\{output\}marketing-ai-admin\.js`/);
  assert.match(build, /writeFile\(`\$\{output\}marketing-ai-admin\.css`/);
});
