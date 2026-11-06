import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('six primary links are canonical, ordered and consistent across Church pages',()=>{
 const names=['매일묵상','예배·방송','공지사항','주요일정','함께하기','마이페이지'];
 const paths=['index.html','devotion/index.html','notices/index.html','schedule/index.html'];
 for(const path of paths){
   const page=read(path);
   const nav=page.match(/<nav id="main-nav"[\s\S]*?<\/nav>/)?.[0]||'';
   assert.ok(nav,path+' has a header');
   assert.equal((nav.match(/<a\b/g)||[]).length,6,path+' exposes six first-level links');
   let last=-1;
   for(const name of names){
     const pos=nav.indexOf('>'+name+'</a>');
     assert.ok(pos>last,path+' preserves '+name+' order');
     last=pos;
   }
   assert.doesNotMatch(nav,/오늘의 삶|공동체|협력소식|큐티인 신청|오시는 길|예배자료/);
   assert.match(page,/church-compact-navigation\.css/);
 }
});

test('home selection filters unrelated sections, preserving existing deep-link targets',()=>{
 const html=read('index.html'),js=read('church-section-nav.js'),css=read('church-compact-navigation.css');
 assert.match(html,/church-section-nav\.js" defer/);
 assert.match(js,/window\.addEventListener\('hashchange',show\)/);
 assert.match(js,/sections\.forEach\(section=>section\.classList\.toggle\('church-section-active'/);
 for(const token of ["worship:['worship']","'weekly-worship':['weekly-worship']","online:['online']","together:['community']","community:['community']","'partner-news':['partner-news']","location:['location']"]){
   assert.ok(js.includes(token),token);
 }
 assert.match(css,/main\.church-section-filtered>section:not\(\.church-section-active\)\{display:none!important\}/);
 assert.match(css,/section\.church-public-panels\.church-section-active\{display:grid!important\}/);
 assert.match(js,/getElementById\(key\)/);
});

test('community, partner updates and QTIN remain inside Together, not the global menu',()=>{
 const html=read('index.html'),sub=read('church-section-nav.js'),runtime=read('script.js');
 const nav=html.match(/<nav id="main-nav"[\s\S]*?<\/nav>/)?.[0]||'';
 for(const pair of [["공동체","#community"],["협력소식","#partner-news"],["오시는 길","#location"],["큐티인 신청","/qtin/church"]]){
   assert.ok(sub.includes("['"+pair[0]+"','"+pair[1]+"']"));
   assert.ok(!nav.includes('>'+pair[0]+'</a>'));
 }
 assert.doesNotMatch(runtime,/label: '공동체'|label: '협력소식'/);
 assert.ok(html.includes('<strong>매일묵상</strong>'));
 assert.doesNotMatch(nav,/오늘의 삶/);
});

test('mobile and desktop use the same responsive header with six accessible actions',()=>{
 const css=read('church-compact-navigation.css');
 assert.match(css,/@media\(min-width:1024px\)/);
 assert.match(css,/@media\(max-width:1023px\)/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/\[aria-current="page"\]/);
});
