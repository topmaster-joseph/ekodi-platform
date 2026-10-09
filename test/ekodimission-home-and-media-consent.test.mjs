import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import spaceWorker from '../space-worker.js';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('Mission home keeps only introduction + active/upcoming event while retaining independent archives',async()=>{
  const [home,archive,js,css]=await Promise.all([
    read('space/ekodimission.page'),read('space/ekodimission-activities.page'),
    read('space/ekodimission.js'),read('space/ekodimission.css')
  ]);
  const sections=[...home.matchAll(/<section\b/g)];
  assert.equal(sections.length,2,'No completed events, long index or history duplicated on home');
  assert.match(home,/class="hero hero-split"/);
  assert.match(home,/data-mission-home-event data-event-last-day="2026-10-10"/);
  assert.match(home,/data-mission-home-empty hidden/);
  assert.match(home,/\/ekodimission\/history/);
  assert.match(home,/\/ekodimission\/activities/);
  for(const obsolete of ['RECENT ACTIVITY','PAST ACTIVITY','OUR JOURNEY · SINCE 2018','MISSION SERVICES','2026 가을 공동체 여행'])
    assert.ok(!home.includes(obsolete),'Home retains old section '+obsolete);
  assert.match(archive,/2026 가을 공동체 여행/);
  assert.match(archive,/2026 에코디 추석 열린식탁/);
  assert.match(js,/timeZone:'Asia\/Seoul'/);
  assert.match(css,/\.mission-home-event\[hidden\]\s*,\s*\.mission-home-empty\[hidden\]\{display:none!important\}/);
});

test('Current-event visibility correctly changes at Korea midnight',async()=>{
 const js=await read('space/ekodimission.js');
 const start=js.indexOf('  const homeCards=[...document.querySelectorAll');
 const end=js.indexOf('  const shareStatus=',start);
 assert.ok(start>0&&end>start);
 const check=new Function('document','Date','Intl',js.slice(start,end));
 const run=(now)=>{
  const card={dataset:{eventLastDay:'2026-10-10'},hidden:false};
  const empty={hidden:true};
  class FakeDate extends Date{constructor(...args){super(...(args.length?args:[now]))}}
  const document={querySelectorAll:()=>[card],querySelector:()=>empty};
  check(document,FakeDate,Intl);
  return {card,empty};
 };
 assert.equal(run('2026-10-09T14:59:59Z').card.hidden,false);
 assert.equal(run('2026-10-10T14:59:59Z').card.hidden,false);
 const ended=run('2026-10-10T15:00:00Z');
 assert.equal(ended.card.hidden,true);
 assert.equal(ended.empty.hidden,false);
});

test('Published mission photo and media-link submissions require explicit server-validated consent',async()=>{
 const [worker,ui]=await Promise.all([read('space-worker.js'),read('space/ekodimission-archive.js')]);
 assert.match(worker,/form\?\.get\('publicConsent'\)!=='true'/);
 assert.match(worker,/body\?\.publicConsent!==true/);
 assert.match(worker,/media_public_consent_required/);
 assert.match(worker,/아동은 보호자 포함/,'Public photo consent must warn about guardians for minors');
 // First-party public POSTs must not silently fall through to ASSETS.fetch.
 assert.match(worker,/request\.method==='POST'&&\(MISSION_ACTIVITY_MEDIA_UPLOAD_RE\.test\(missionWritePath\)\|\|MISSION_ACTIVITY_MEDIA_RE\.test\(missionWritePath\)\)/);
 assert.match(worker,/return routeEkodiMission\(request,env\);/);
 assert.match(worker,/name=\"publicConsent\" value=\"true\" required/g);
 assert.match(ui,/body\.set\('publicConsent','true'\)/);
 assert.match(ui,/publicConsent:data\.get\('publicConsent'\)==='true'/);
 assert.match(ui,/publicConsent.*\?\.checked/);
 const uploadHandler=worker.slice(worker.indexOf('async function routeMissionActivityMediaUpload'),worker.indexOf('async function routeMissionActivityMediaFile'));
 const linkHandler=worker.slice(worker.indexOf('async function routeMissionActivityMedia(request'),worker.indexOf('async function routeMissionActivityArchive'));
 assert.ok(uploadHandler.indexOf("form?.get('publicConsent')!=='true'")>0);
 assert.ok(uploadHandler.indexOf("form?.get('publicConsent')!=='true'")<uploadHandler.indexOf('crypto.subtle.digest'));
 assert.ok(linkHandler.indexOf('body?.publicConsent!==true')>0);
 assert.ok(linkHandler.indexOf('body?.publicConsent!==true')<linkHandler.indexOf('activity_public_submit_media_link'));
 // Public-facing POSTs are forwarded by the central router into Space; fail
 // immediately at the server without calling Storage or Supabase if consent is missing.
 const env={
  ASSETS:{fetch:async()=>{throw new Error('Media request fell through to the static asset router')}},
  STORAGE:{fetch:async()=>{throw new Error('No storage write should happen without consent')}}
 };
 const link=await spaceWorker.fetch(new Request('https://ekodi.kr/ekodimission/api/activities/260926-chuseok-open-table/media',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({url:'https://example.org/public-gallery',type:'album'})
 }),env);
 assert.equal(link.status,400);
 assert.equal((await link.json()).error,'media_public_consent_required');
 const form=new FormData();
 form.set('file',new File([new Uint8Array([0x89,0x50,0x4e,0x47])],'photo.png',{type:'image/png'}));
 const photo=await spaceWorker.fetch(new Request('https://ekodi.kr/ekodimission/api/activities/260926-chuseok-open-table/media-upload',{method:'POST',body:form}),env);
 assert.equal(photo.status,400);
 assert.equal((await photo.json()).error,'media_public_consent_required');
});
