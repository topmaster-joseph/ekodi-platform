import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('weekly texts are supplied to existing nine-language core-to-extended translation chain',async()=>{
 const core=await read('church-i18n.js');
 const extended=await read('church-i18n-extended.js');
 const page=await read('index.html');
 const weekly=page.slice(page.indexOf('<section class="church-weekly-focus"'),page.indexOf('<section class="intro section"'));
 assert.match(core,/Object\.assign\(TEXT,/);
 assert.match(extended,/EKODIChurchI18n\?\.translate\?\.\(source,'en'\)/);
 assert.ok(weekly.includes('주일모임 예배자료'));
 for(const phrase of ['주일모임 예배자료','예배 준비 현황','예배 날짜','01 주보 · 말씀','02 발표자료 · PPT','03 방송 · 유튜브','주일모임 내용 바로 관리','관리자 예배 자동준비 →']){
   assert.ok(core.includes(JSON.stringify(phrase)),phrase+' missing locale dictionary entry');
 }
 new Function(core);
});
test('date-specific weekly data is localized before rendering into non-Korean views',async()=>{
 const source=await read('church-weekly-worship.js');
 new Function(source);
 assert.match(source,/title\.textContent=localize\(data\.title/);
 assert.match(source,/metadata\.textContent=metadataText\(data\)/);
 assert.match(source,/localize\(data\.scripture/);
 assert.match(source,/localize\(data\.preacher/);
 assert.match(source,/localize\('주일모임'/);
 const start=source.indexOf('function weeklyLocale()');
 const end=source.indexOf('function archivePath(entry)');
 assert.ok(start>0&&end>start);
 const mockWindow={EKODIChurchI18n:{translate:(source)=>source}};
 const mockDoc={documentElement:{lang:'en',dataset:{ekodiLocale:'en'}}};
 const factory=new Function('window','document','location',source.slice(start,end)+';return {weeklyLocale,localize,metadataText};');
 const locale=factory(mockWindow,mockDoc,{search:'?lang=vi'});
 assert.equal(locale.weeklyLocale(),'en');
 assert.equal(locale.localize('품 안에서, 세상으로','Sunday worship'),'Sunday worship');
 assert.doesNotMatch(locale.metadataText({date:'2026-10-18',time:'11:00',scripture:'신명기 33:12–19',preacher:'정찬균 목사'}),/[가-힣]/);
});
