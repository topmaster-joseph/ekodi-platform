import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

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
});
