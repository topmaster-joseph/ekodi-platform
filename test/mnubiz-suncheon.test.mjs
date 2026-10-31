import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isMnuBizSuncheonPath,renderMnuBizSuncheonPage} from '../mnubiz-suncheon-page.js';

test('Suncheon seminar public landing follows simple alumni style and preserves funding split',async()=>{
  assert.equal(isMnuBizSuncheonPath('/mnubiz/seminars/suncheon-2026'),true);
  assert.equal(isMnuBizSuncheonPath('/mnubiz/seminars/suncheon-2026/settlement'),true);
  assert.equal(isMnuBizSuncheonPath('/mnubiz/seminars/suncheon-2026/private-other'),false);
  const response=renderMnuBizSuncheonPage('/mnubiz/seminars/suncheon-2026');
  const html=await response.text();
  for(const token of ['국립목포대학교 경영동문회','2026 순천·광양','1,200,000원','720,000원','1,920,000원','1인 기준 120,000원','/mnubiz/seminars/suncheon-2026/settlement','2026.11.26.','site-header mnubiz-header'])assert.ok(html.includes(token),token);
  assert.match(html,/<meta name="robots" content="index,follow">/);
  assert.doesNotMatch(html,/<style[\s>]/);
  assert.doesNotMatch(html,/<footer[\s>]/);
});
test('Private settlement surface never embeds member data and is not indexed',async()=>{
  const response=renderMnuBizSuncheonPage('/mnubiz/seminars/suncheon-2026/settlement');
  const html=await response.text();
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  assert.match(html,/name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html,/id="settlement-member" hidden/);
  assert.match(html,/id="settlement-review" class="mnubiz-block" hidden/);
  assert.match(html,/id="settlement-auth" hidden/);
  assert.doesNotMatch(html,/service_role|secret_key/i);
  assert.match(html,/client.js/);
});
test('Site offers member-only settlement with wider line-height and server-side membership policies',async()=>{
  const css=await readFile(new URL('../space/mnubiz/seminars/suncheon-2026/style.css',import.meta.url),'utf8');
  const js=await readFile(new URL('../space/mnubiz/seminars/suncheon-2026/client.js',import.meta.url),'utf8');
  const worker=await readFile(new URL('../space-worker.js',import.meta.url),'utf8');
  const publicSite=await readFile(new URL('../mnubiz-public-page.js',import.meta.url),'utf8');
  assert.match(css,/line-height:1\.85/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(js,/\.from\('tenant_members'\)/);
  assert.match(js,/\.from\('mnubiz_suncheon_claims'\)/);
  assert.match(js,/status:'submitted'/);
  assert.match(js,/getUser\(\)/);
  assert.match(worker,/isMnuBizSuncheonPath\(url.pathname\)/);
  assert.match(worker,/env.ASSETS.fetch\(request\)/);
  assert.match(publicSite,/세미나 기본계획 보기/);
  const postgresMigration=await readFile(new URL('../supabase/migrations/20261031090000_mnubiz_suncheon_seminar_settlement.sql',import.meta.url),'utf8');
  assert.match(postgresMigration,/alter table public\.mnubiz_suncheon_claims enable row level security/);
  const {access}=await import('node:fs/promises');
  await assert.rejects(access(new URL('../migrations/202610310900_mnubiz_suncheon_seminar_settlement.sql',import.meta.url)),/ENOENT/);
});
