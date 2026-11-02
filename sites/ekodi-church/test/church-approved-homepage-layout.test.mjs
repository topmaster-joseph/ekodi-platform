import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('approved homepage gives dated worship its own first-class route without duplicating admin actions',async()=>{
 const html=await read('index.html');
 const css=await read('church-homepage-layout.css');
 assert.match(html,/href="#weekly-worship">예배자료<\/a>/);
 assert.match(html,/href="#weekly-worship"><span>05<\/span><strong>주보·PPT<\/strong>/);
 assert.match(html,/data-church-weekly/);
 assert.equal((html.match(/data-church-worship-admin/g)||[]).length,1);
 assert.match(html,/data-weekly-editor hidden/);
 assert.match(css,/\.church-weekly-focus\{display:none!important\}/);
 assert.match(css,/\.church-weekly-focus:target,\.church-weekly-focus:has\(:target\)\{display:block!important\}/);
 assert.match(css,/body:has\(main :target\) \.hero\{display:none!important\}/);
 assert.match(css,/#weekly-worship,#online,#about/);
});

test('Online view uses exactly YouTube worship and shared EKODI Live, not a redundant meditation or old video room',async()=>{
 const html=await read('index.html');
 const online=html.slice(html.indexOf('<section class="online section"'),html.indexOf('<section class="community-visit"'));
 assert.match(online,/YOUTUBE · EKODI LIVE/);
 assert.match(online,/online-triad online-triad--broadcast/);
 assert.equal((online.match(/<article class="ministry-card /g)||[]).length,2);
 assert.match(online,/id="youtube-player"/);
 assert.match(online,/id="churchInlineLiveFrame"/);
 assert.match(online,/id="churchWatchFullscreen"/);
 assert.match(online,/href="\/live\/church\/\?mode=viewer"/);
 assert.match(online,/href="\/live\/church\/\?mode=studio&amp;activity=event"/);
 assert.doesNotMatch(online,/devotion-card|meet\.jit\.si|EKODIChurchLive/);
 assert.equal((html.match(/id="daily-devotion"/g)||[]).length,1);
 assert.match(html,/<article class="life-panel word-lens reveal" id="daily-devotion">/);
});

test('responsive layout centers header and footer; selected section hides oversized hero',async()=>{
 const html=await read('index.html');
 const css=await read('church-homepage-layout.css');
 const footer=await read('church-footer.css');
 assert.match(html,/<link rel="stylesheet" href="church-homepage-layout\.css">/);
 assert.match(css,/--church-content-width:1120px/);
 assert.match(css,/position:sticky!important/);
 assert.match(css,/background:#fbfaf6!important/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/@media\(max-width:420px\)/);
 assert.match(css,/#online \.online-triad--broadcast\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/#online \.online-triad--broadcast\{grid-template-columns:1fr\}/);
 assert.match(footer,/\.church-footer-inner\{/);
 assert.doesNotMatch(css,/api\/session|streamKey|supabase|youtube\.googleapis/);
});

test('approved short labels use existing core-and-extended nine-language chain',async()=>{
 const source=await read('church-i18n.js');
 const extended=await read('church-i18n-extended.js');
 new Function(source);
 for(const label of ['예배자료','주보·PPT','날짜별 예배자료와 진행 화면']){
  assert.ok(source.includes(JSON.stringify(label)),label+' must be localized');
 }
 assert.match(extended,/EKODIChurchI18n/);
 const html=await read('index.html');
 assert.match(html,/church-i18n-extended\.js/);
});
