import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {header,footer,SITES,plan} from '../scripts/site-chrome.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const json=p=>JSON.parse(read(p));
test('official EKODI-owned publishing and management brand names have one canonical spelling',()=>{
  const registry=json('config/ecosystem-services.json');
  const names=Object.fromEntries(registry.services.map(x=>[x.id,x.name]));
  assert.equal(names.publishing,'에코디출판');
  assert.equal(names.management,'에코디경영');
  assert.equal(SITES.publishing.name,'에코디출판');
  assert.equal(SITES.books.name,'에코디서점');
  const management=json('config/management-platform.json');
  assert.equal(management.platform.name,'에코디경영');
  assert.equal(management.platform.userFacingName,'에코디경영');
  assert.equal(registry.services.find(x=>x.id==='management').status,'preparing');
  assert.equal(registry.services.find(x=>x.id==='publishing').status,'live');
});
test('all twenty generated publishing-bookstore headers and footers carry official brand while retaining identity',()=>{
  const output=plan();
  for(const id of ['books','publishing']){
    for(const rel of SITES[id].pages){
      const text=read(rel);
      assert.equal(text,output.get(rel),rel+' has generator drift');
      const head=text.match(/<header\b[\s\S]*?<\/header>/)?.[0]||'';
      const foot=text.match(/<footer\b[\s\S]*?<\/footer>/)?.[0]||'';
      assert.match(head,/<b>에코디출판<\/b><span>책을 만들다<\/span>/);
      assert.match(foot,/>에코디출판<\/a>/);
      assert.ok(head.includes('href="https://ekodi.kr/publishing/"'));
      if(id==='publishing'){
        assert.match(head,/aria-label="에코디출판 홈"/);
        assert.match(head,/aria-label="에코디출판 메뉴"/);
        assert.match(foot,/<h2>에코디출판<\/h2>/);
        assert.match(text,/<title>[^<]*에코디출판[^<]*<\/title>/);
        assert.match(foot,/운영 에코디비즈/,'legal operating entity stays unchanged');
      }else{
        assert.match(head,/<b>에코디서점<\/b>/);
        assert.match(foot,/상호 에코디비즈/,'bookstore seller remains independent');
      }
    }
  }
});
test('management public header, release smoke and publishing health are consistent with canonical names',()=>{
  const html=read('management/index.html');
  assert.match(html,/<title>에코디경영 \| 경영 AI·조직 운영<\/title>/);
  assert.match(html,/<strong>에코디경영<\/strong><small class="management-brand-en">EKODI MANAGEMENT<\/small>/);
  assert.match(read('publishing-worker.js'),/publicName:'에코디출판'/);
  assert.match(read('admin-service-catalog.js'),/id:'publishing', name:'에코디출판'/);
  assert.match(read('admin-service-catalog.js'),/id:'management', name:'에코디경영'/);
  assert.ok(JSON.stringify(json('deploy/manifests/management.worker.json')).includes('에코디경영'));
  assert.match(read('my/app.js'),/\['books','에코디서점','https:\/\/ekodi\.kr\/books'\]/);
});
test('first-party naming never promotes or reassigns a service',()=>{
  const services=json('config/ecosystem-services.json').services;
  assert.equal(services.length,37);
  const ids=services.map(x=>x.id);assert.equal(new Set(ids).size,37);
  for(const item of services) {
    assert.match(item.url,/^https:\/\/ekodi\.kr\//);
    assert.ok(['live','beta','preparing','planned'].includes(item.status));
  }
  assert.ok(!services.some(x=>x.id==='bbqcg'||x.id==='cgma'||x.id==='seonammedi'));
});
