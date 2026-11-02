import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const home=read('index.html');
const client=read('church-weekly-worship.js');
const css=read('church-weekly-worship.css');
const manifest=JSON.parse(read('worship/weekly.json'));
test('weekly worship is public, responsive and role-gated in-place',()=>{
  assert.match(home,/data-church-weekly/);
  assert.match(home,/church-weekly-worship\.js/);
  assert.match(home,/church-weekly-worship\.css/);
  assert.equal((home.match(/data-church-worship-admin/g)||[]).length,1,'one canonical role-gated management control');
  assert.match(home,/data-church-worship-admin[^>]+hidden/);
  assert.match(home,/data-weekly-editor[^>]+hidden/);
  assert.match(css,/@media\(max-width:760px\)/);
  new Function(client);
});
test('weekly manifest references only existing Sunday packets, without modifying archival services',()=>{
  assert.equal(manifest.schema,'ekodi.church.worship.index.v1');
  assert.ok(manifest.services.length>=2);
  const dates=new Set();
  for(const item of manifest.services){
    assert.equal(new Date(item.date+'T00:00:00Z').getUTCDay(),0);
    assert.ok(!dates.has(item.date));dates.add(item.date);
    assert.equal(item.page,'/ekodichurch/worship/'+item.date+'/');
    assert.ok(existsSync(new URL('../worship/'+item.date+'/index.html',import.meta.url)));
  }
  assert.ok(dates.has('2026-10-18'));
});
test('writes demand verified worship capability and server RLS; YouTube action cannot claim scheduled',()=>{
  assert.match(client,/scope=worship-access/);
  assert.match(client,/decision\?\.permissions\?\.worship!==true/);
  assert.match(client,/check\?\.permissions\?\.worship!==true/);
  assert.match(client,/getUTCDay\(\)===0/);
  assert.match(client,/api\/public\/scripture\/common\?date=/);
  assert.match(client,/is_published:publish/);
  assert.match(client,/on_conflict=service_type,service_date/);
  assert.doesNotMatch(client,/RTMP_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
  assert.doesNotMatch(client,/youtube\.googleapis\.com|liveBroadcasts\/insert/);
  assert.match(home,/외부 채널은 실제 송출 준비 확인 후 선택/);
  assert.match(home,/data-weekly-live-host/);
});
