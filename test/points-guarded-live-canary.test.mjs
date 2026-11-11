import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const manifest=JSON.parse(read('deploy/manifests/my.worker.json'));
const html=read('my/points/index.html'),app=read('my/points/app.js'),css=read('my/points/styles.css');
const production=read('wrangler.my.toml');
const requests=manifest.worker.requests;
const byUrl=url=>requests.find(r=>r.url===url);
const internal='https://ekodi-my.topmaster-joseph.workers.dev',canonical='https://ekodi.kr/my';

test('guarded My release probes the points page, JS, CSS and disabled runtime on internal and canonical hosts',()=>{
  for(const route of ['/points/','/points/app.js','/points/styles.css','/config.js']){
    const a=byUrl(internal+route),b=byUrl(canonical+route);
    assert.ok(a&&b,route+' must be covered on internal candidate and canonical live host');
    for(const request of [a,b]){
      assert.deepEqual(request.statuses,[200]);
      assert.equal(request.redirect,'manual');
      assert.ok(Array.isArray(request.expect)&&request.expect.length);
      assert.ok(Array.isArray(request.rollbackExpect)&&request.rollbackExpect.length);
      assert.notEqual(request.rollbackVerify,false);
    }
    assert.equal(a.candidateVerify,undefined);
    assert.equal(b.candidateVerify,false);
    assert.ok(b.candidateVerifyReason);
  }
});
test('points canaries reflect real safe assets, not member or economic mutations',()=>{
  const targets=[
    [byUrl(internal+'/points/'),html],
    [byUrl(internal+'/points/app.js'),app],
    [byUrl(internal+'/points/styles.css'),css]
  ];
  for(const [request,source] of targets)for(const marker of request.expect){
    assert.ok(source.includes(marker),request.url+' lacks '+marker);
  }
  for(const request of requests.filter(x=>x.url?.includes('/points/'))){
    assert.ok(!('method' in request), 'read-only GET check only');
    assert.ok(!('body' in request), 'no POST body or synthetic member data');
  }
  assert.match(production,/POINTS_ENABLED = "false"/);
  for(const host of [internal,canonical]){
    assert.ok(byUrl(host+'/config.js').expect.includes('"pointsEnabled":false'));
    assert.ok(byUrl(host+'/config.js').expect.includes('"dataMode":"production"'));
  }
});
test('rollback guard accepts only pre-existing safe points experience, never demands CSV from old release',()=>{
  for(const request of requests.filter(x=>x.url?.includes('/points/'))){
    assert.ok(!request.rollbackExpect.some(s=>s.includes('exportPointsHistory')||
      s.includes('POINTS_MEMBER_EXPORT_BEGIN')||s.includes('20261111-site-ledger-csv-v1')));
  }
  assert.ok(byUrl(canonical+'/points/').expect.includes('id="exportPointsHistory"'));
  assert.match(app,/snapshot\.site!==select\.value/);
  assert.match(app,/snapshot\.revision!==viewRevision/);
  assert.match(app,/await sb\.auth\.getSession\(\)/);
});
