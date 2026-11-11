import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('../my/points/index.html');
const js=read('../my/points/app.js');
const css=read('../my/points/styles.css');

test('personal points has accessible wallet, activity and invite tabs',()=>{
  for(const id of ['wallet','claims','progress','invite']){
    assert.ok(html.includes('data-points-tab="'+id+'"'));
  }
  assert.match(html,/role="tablist"/);
  assert.match(html,/id="pointsWalletPanel" role="tabpanel"/);
  assert.match(html,/id="claimSection" hidden role="tabpanel"/);
  assert.match(html,/id="pointsProgressSection" role="tabpanel"[^>]*hidden/);
  assert.match(html,/id="referralSection" hidden role="tabpanel"/);
  assert.match(js,/pointTabButtons\.forEach/);
  assert.match(js,/event\.key==='ArrowRight'/);
  assert.match(js,/event\.key==='Home'/);
});
test('tabs never override server authorization and responsive widths remain available',()=>{
  assert.match(html,/id="claimSection"[^>]*hidden/);
  assert.match(html,/id="referralSection"[^>]*hidden/);
  assert.match(js,/refreshPointTabState\(\)/);
  assert.doesNotMatch(js,/removeAttribute\('hidden'\)/);
  assert.match(css,/max-width:420px/);
  assert.match(css,/\[aria-selected="true"\]/);
});

test('missions use only the self-scoped server progress response and never award in the browser',()=>{
  assert.match(js,/request\('\/progress\?site='\+encodeURIComponent\(site\),token\)/);
  assert.match(js,/data\?\.reward_policy!=='recognition_only'/);
  assert.match(js,/data\.level\.verified_activities_90d/);
  assert.match(js,/data\.streak\.current_days/);
  assert.match(js,/progressMissions\.replaceChildren\(\)/);
  assert.match(js,/if\(revision!==viewRevision\)return;/);
  assert.match(js,/function clearProgress\(\)/);
  assert.match(js,/clearPrivateView\(message\)/);
  assert.match(css,/body\[data-points-tab="progress"\] #pointsWalletPanel/);
  assert.match(html,/id="pointsMissionList"/);
  assert.doesNotMatch(js,/innerHTML|award_evidence|points_admin_decide|\.insert\(/);
});
 
test('claim and ledger date display is pinned to Asia/Seoul independently of browser timezone',()=>{
  assert.ok(js.includes("new Date(row.submitted_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})"));
  assert.ok(js.includes("new Date(row.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})"));
  assert.ok(html.includes('/my/points/app.js?v=20261112-csv-owner-binding-v2'));
});
