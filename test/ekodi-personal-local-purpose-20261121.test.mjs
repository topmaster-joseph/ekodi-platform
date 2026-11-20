import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const manifest=JSON.parse(read('config/ekodi-site-missions.json'));
const registry=JSON.parse(read('config/ecosystem-services.json'));
test('local commerce beta declares its purpose in its own intro without implying that payments are live',()=>{
 const html=read('local-commerce/index.html'),css=read('local-commerce/styles.css');
 const purpose=manifest.sites.find(x=>x.id==='local-commerce').mission;
 assert.equal((html.match(/data-ekodi-mission="local-commerce"/g)||[]).length,1);
 assert.ok(html.includes('<p>'+purpose+'</p>'));
 for(const label of ['현재 운영 모드','현금 보관 없음','자동 송금 없음','실물 결제사업자 연동 잠금','id="accountAction"'])assert.ok(html.includes(label));
 assert.ok(css.includes('.hero .ekodi-mission-statement'));
 assert.equal(registry.services.find(x=>x.id==='local-commerce').status,'beta');
});
test('My EKODI personal hub has mission, without publishing the member-only data or changing authentication',()=>{
 const html=read('my/index.html'),css=read('my/styles.css');
 const purpose=manifest.sites.find(x=>x.id==='my').mission;
 assert.equal((html.match(/data-ekodi-mission="my"/g)||[]).length,1);
 assert.ok(html.includes('<p>'+purpose+'</p>'));
 assert.match(html,/id="identityEmail"/);
 assert.match(html,/data-member-only hidden/);
 assert.match(html,/auth\/\?site=my&amp;return_to=https%3A%2F%2Fekodi\.kr%2Fmy%2F/);
 assert.ok(css.includes('.welcome-copy .ekodi-mission-statement'));
 assert.equal(registry.services.find(x=>x.id==='my').status,'live');
});
test('brand text cannot be imposed on independent third-party operator landing',()=>{
 const franchise=read('space/index.html');
 assert.ok(franchise.includes('YOGURT PURPLE'));
 assert.ok(!franchise.includes('data-ekodi-mission="space"'));
 for(const id of ['local-commerce','my']){
   const mission=manifest.sites.find(x=>x.id===id);
   assert.equal(mission.ownerScope,'ekodi-first-party');
 }
});
