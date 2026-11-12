import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ecosystem=JSON.parse(read('config/ecosystem-services.json'));
const plan=JSON.parse(read('config/ekodi-site-missions.json'));
const pages={
  platform:['index.html',null],
  publishing:['publishing/index.html','publishing/pages.css'],
  books:['books/index.html','books/styles.css'],
  management:['management/index.html','management/styles.css'],
  edu:['education/index.html','education/styles.css'],
  insurance:['sites/ekodi-insurance/public/index.html','sites/ekodi-insurance/public/styles.css'],
  lab:['sites/ekodi-lab/index.html',null],
  social:['social/index.html','social/styles.css'],
  community:['community/index.html','community/styles.css'],
  journal:['journal/index.html','journal/styles.css'],
  delivery:['delivery/index.html','delivery/styles.css'],
  business:['business/index.html','business/styles.css'],
  author:['author/index.html','author/styles.css'],
  life:['life/index.html','life/styles.css'],
  work:['work/index.html','work/styles.css'],
  money:['money/index.html','money/styles.css'],
  support:['support/index.html','support/styles.css'],
  energy:['energy/index.html','energy/styles.css'],
  cafe:['sites/ekodi-cafe/index.html',null],
  bible:['bible/index.html','bible/styles.css']
};
test('all 37 owned EKODI site missions are unique, purposeful and matched to actual registry names',()=>{
  assert.equal(plan.policyId,'EKODI-SITE-MISSION-DECLARATION-001');
  assert.equal(plan.governance.noGlobalForcedOverlay,true);
  assert.equal(plan.governance.noExternalBrandInjection,true);
  assert.equal(plan.sites.length,ecosystem.services.length);
  assert.equal(plan.sites.length,37);
  assert.deepEqual(plan.sites.map(x=>x.id),ecosystem.services.map(x=>x.id));
  const seen=new Set();
  for(const [i,item] of plan.sites.entries()){
    const site=ecosystem.services[i];
    assert.equal(item.officialName,site.name,item.id+' name drift');
    assert.equal(item.ownerScope,'ekodi-first-party');
    assert.equal(item.publication,'requires-site-owned-release');
    assert.ok(item.mission.length>=28&&item.mission.length<=150,item.id);
    assert.match(item.mission,/^우리는 /,item.id);
    assert.match(item.mission,/다\.$/,item.id);
    assert.doesNotMatch(item.mission,/원클릭 구매|고수익 보장|매출 보장|공식 인증 기관|등록상표|지금 바로 구매/,item.id);
    assert.ok(!seen.has(item.mission),'duplicate mission '+item.id);
    seen.add(item.mission);
  }
  assert.ok(!plan.sites.some(x=>['bbqcg','cgma','seonammedi','mokpo-presbytery'].includes(x.id)));
});
test('20 first-party actual homepage introduction sections display the exact canonical local purpose',()=>{
  const byId=new Map(plan.sites.map(x=>[x.id,x]));
  for(const [id,[path,css]] of Object.entries(pages)){
    const html=read(path);
    const re=new RegExp('data-ekodi-mission="'+id+'"','g');
    assert.equal((html.match(re)||[]).length,1,path+' must declare exactly once');
    assert.match(html,/우리가 존재하는 이유/,path);
    if(id!=='platform'){
      const mission=byId.get(id)?.mission;
      assert.ok(mission,path+' not in canonical registry');
      assert.ok(html.includes('<p>'+mission+'</p>'),path+' mission drift');
    }else{
      assert.match(html,/각자의 자유와 존엄을 지키며/);
    }
    assert.ok((css?read(css):html).includes('.ekodi-mission-statement'),path+' visual policy missing');
  }
});
test('owned site mission banners never alter public site status, franchisor marks or auth return path',()=>{
  assert.equal(ecosystem.services.find(x=>x.id==='management').status,'preparing');
  assert.equal(ecosystem.services.find(x=>x.id==='cafe').status,'preparing');
  assert.equal(ecosystem.services.find(x=>x.id==='publishing').status,'live');
  assert.match(read('sites/ekodi-cafe/index.html'),/아직 문을 열지 않은 카페입니다/);
  assert.match(read('management/index.html'),/auth\/\?site=management&amp;return_to=/);
  assert.match(read('sites/ekodi-insurance/public/index.html'),/실제 설계사 상담을 요청할 때만/);
  assert.match(read('money/index.html'),/실제 이체·해지·변경은 언제나 본인이/);
  assert.match(read('delivery/index.html'),/storeResolver/);
  assert.match(read('publishing/index.html'),/운영 에코디비즈/);
});
