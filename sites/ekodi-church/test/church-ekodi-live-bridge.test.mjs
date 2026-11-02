import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('homepage removes standalone Jitsi video meeting and delegates live broadcasts to EKODI Live',async()=>{
 const html=await load('index.html');
 assert.doesNotMatch(html,/meet\.jit\.si|EKODIChurchLive|실시간 화상 교제실|실시간 화상 참여|<h3>실시간 화상<\/h3>/);
 assert.match(html,/href="\/live\/church\/\?mode=studio&amp;activity=sunday"/);
 assert.match(html,/href="\/live\/church\/\?mode=studio&amp;activity=event"/);
 assert.match(html,/href="\/live\/church\/"/);
 assert.match(html,/data-weekly-live-host/);
 assert.match(html,/EKODI Live 동시방송/);
 assert.match(html,/외부 동시송출은 준비된 채널만 선택/);
 assert.match(html,/data-church-worship-admin/);
 assert.match(html,/data-weekly-bulletin/);
 assert.match(html,/data-weekly-slides/);
 assert.match(html,/data-weekly-broadcast/);
});
test('selected Sunday date and sermon name are carried to central studio; no auto go-live',async()=>{
 const script=await load('church-weekly-worship.js');
 new Function(script);
 assert.match(script,/new URL\('\/live\/church\/',location\.origin\)/);
 assert.match(script,/url\.searchParams\.set\('activity','sunday'\)/);
 assert.match(script,/url\.searchParams\.set\('date',date\)/);
 assert.match(script,/if\(liveHost\)liveHost\.href=studioUrl\(entry\.date\)/);
 assert.match(script,/if\(liveHost\)liveHost\.href=studioUrl\(data\.date,data\.title\|\|''\)/);
 assert.doesNotMatch(script,/goLiveButton|streamKey|startBroadcast\(/);
});
test('new Church EKODI Live copy is in shared 9-language chain',async()=>{
 const dict=await load('church-i18n.js');
 new Function(dict);
 for(const phrase of ['라이브 방송','주일예배 방송 준비','활동·행사 방송 준비','EKODI Live 시청','EKODI Live 동시방송','외부 동시송출은 준비된 채널만 선택']){
   assert.ok(dict.includes(phrase),'missing copy '+phrase);
 }
 const extended=await load('church-i18n-extended.js');
 assert.match(extended,/EKODIChurchI18n\?\.translate/);
});

test('Church status badge no longer opens a video popup or overrides canonical Live links',async()=>{
 const source=await load('church-online-status.js');
 new Function(source);
 assert.match(source,/const baseJoin='\/live\/church\/'/);
 assert.match(source,/const endpoint='https:\/\/ekodi\.kr\/api\/realtime\/live\?tenant=ekodichurch'/);
 assert.doesNotMatch(source,/meet\.jit\.si|ensureLiveDialog|wireIntegratedLive|openIntegratedLive|churchLiveDialog|iframe/);
 const css=await load('church-live-entry.css');
 assert.doesNotMatch(css,/church-live-dialog/);
});
