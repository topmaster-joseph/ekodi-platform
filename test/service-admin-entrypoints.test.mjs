import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
const registry=JSON.parse(read('config/ecosystem-services.json'));

test('registered service admin entrypoints use same-origin canonical /admin',()=>{
  const rows=registry.services.filter(service=>service.adminUrl);
  assert.ok(rows.length>=15,'expected broad service admin coverage');
  for(const service of rows){
    const serviceUrl=new URL(service.url);
    const adminUrl=new URL(service.adminUrl);
    assert.equal(adminUrl.origin,serviceUrl.origin,service.id+' admin origin');
    assert.equal(adminUrl.pathname.replace(/\/+$/,''),'/admin',service.id+' admin path');
    assert.equal(adminUrl.protocol,'https:',service.id+' admin protocol');
  }
});

test('every registered admin entry has a routed runtime owner',()=>{
  const runtimeByService={
    bible:'bible-worker.js',community:'community-worker.js',social:'social-worker.js',business:'business-worker.js',
    management:'management-worker.js',invest:'platform-router-entry-worker.js',support:'support-worker.js',money:'money-worker.js',
    pay:'site-worker.js',books:'books-worker.js',publishing:'publishing-worker.js',journal:'journal-worker.js',author:'author-worker.js',
    edu:'education-worker.js',life:'life-worker.js',work:'work-worker.js',energy:'energy-worker.js',messenger:'platform-router-entry-worker.js',
    mail:'platform-router-entry-worker.js',live:'site-worker.js',cloud:'site-worker.js'
  };
  for(const service of registry.services.filter(row=>row.adminUrl)){
    const runtime=runtimeByService[service.id];
    assert.ok(runtime,service.id+' runtime owner missing from contract test');
    assert.match(read(runtime),/\/admin/,service.id+' runtime lacks /admin route');
  }
});

test('key common-service admin routes are registered',()=>{
  for(const id of ['journal','mail','invest','messenger','pay','live','management','author']){
    const service=registry.services.find(row=>row.id===id);
    assert.ok(service?.adminUrl,id+' adminUrl missing');
  }
});

test('missing service handoffs are implemented in shared runtimes',()=>{
  assert.match(read('management-worker.js'),/focus=management/);
  assert.match(read('author-worker.js'),/focus=author/);
  assert.match(read('platform-router-entry-worker.js'),/focus=invest/);
  assert.match(read('platform-router-entry-worker.js'),/focus=messenger/);
  assert.ok(read('site-worker.js').includes('HUB_HOSTS.has(host) && PUBLIC_ADMIN_ALIASES.has(url.pathname)'));
});

test('central admin system map exposes service-local manage actions',()=>{
  const map=read('system-map-admin.js');
  assert.match(map,/service.adminUrl/);
  assert.match(map,/dataset.adminEntry/);
});

