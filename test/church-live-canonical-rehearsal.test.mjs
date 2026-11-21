import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tenantLivePage} from '../tenant-live-page.js';
const root=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=root('tenant-live.css'),script=root('tenant-live.js');
const tenant=(path,apiTenant)=>({path,apiTenant,mode:'worship',title:'Test Church',home:'/ekodichurch/',name:'에코디교회',authSite:'church'});

test('only actual canonical /live/church/ studio gets private rehearsal controls',async()=>{
  const page=await tenantLivePage(tenant('/live/church/','ekodichurch'));
  const html=await page.text();
  for(const id of ['localRehearsalStart','localRehearsalStop','localRehearsalPlayback','localRehearsalStatus']){
    assert.match(html,new RegExp('id="'+id+'"'),id);
  }
  assert.match(html,/id="programStage"/);
  assert.match(html,/id="goLiveButton"/);
  const legacy=await tenantLivePage(tenant('/ekodichurch/live/','ekodichurch'));
  assert.doesNotMatch(await legacy.text(),/id="localRehearsalStart"/);
  const other=await tenantLivePage(tenant('/live/biz/','ekodibiz'));
  assert.doesNotMatch(await other.text(),/id="localRehearsalStart"/);
});

test('half-size monitor is scoped to church, has responsive fallback and preserves production capture',()=>{
  assert.match(css,/body\[data-tenant="ekodichurch"\] #studioView\.studio/);
  assert.match(css,/grid-template-columns:minmax\(0,460px\) minmax\(0,390px\)/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/#programStage\.stage\.portrait\{aspect-ratio:9\/16\}/);
  assert.match(script,/LANDSCAPE=\{width:1280,height:720\}/);
});

test('preflight records and plays back only in the local browser, without server broadcast side effects',()=>{
  const start=script.indexOf('async function startLocalRehearsal(){');
  const end=script.indexOf('function stopLocalRehearsal(){',start);
  assert.ok(start>0&&end>start);
  const handler=script.slice(start,end);
  assert.match(handler,/new MediaRecorder\(stream/);
  assert.match(handler,/URL\.createObjectURL\(blob\)/);
  assert.match(handler,/cfg\.tenant!=='ekodichurch'/);
  assert.doesNotMatch(handler,/createRoom\(|startHost\(|goLive\(|api\(|publishStream\(|startRecording\(|sendBeacon\(/);
  assert.match(script,/if\(localRehearsalRecorder\?\.state==='recording'\)/);
  assert.match(script,/localRehearsalRecorder\.onstop=null/);
  assert.match(script,/addEventListener\('click',startLocalRehearsal\)/);
});
