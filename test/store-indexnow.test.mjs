import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EKODI_INDEXNOW_KEY,
  EKODI_INDEXNOW_KEY_PATH,
  EKODI_INDEXNOW_KEY_URL,
  isEkodiIndexNowKeyPath,
  ekodiIndexNowKeyResponse,
} from '../platform-indexnow.js';
import {
  EKODI_PUBLIC_REGISTRY_PATH,
  isPublicDiscoveryPath,
  buildEkodiPublicRegistry,
} from '../public-discovery-registry.js';

test('platform IndexNow key uses one apex ownership contract',async()=>{
  assert.match(EKODI_INDEXNOW_KEY,/^[a-fA-F0-9-]{8,128}$/);
  assert.equal(EKODI_INDEXNOW_KEY_PATH,`/${EKODI_INDEXNOW_KEY}.txt`);
  assert.equal(EKODI_INDEXNOW_KEY_URL,`https://ekodi.kr/${EKODI_INDEXNOW_KEY}.txt`);
  assert.equal(isEkodiIndexNowKeyPath(EKODI_INDEXNOW_KEY_PATH),true);
  const response=ekodiIndexNowKeyResponse();
  assert.equal(response.status,200);
  assert.equal((await response.text()).trim(),EKODI_INDEXNOW_KEY);
  assert.equal(response.headers.get('x-ekodi-route'),'platform-indexnow-key');
});

test('public discovery policy blocks private control surfaces',()=>{
  assert.equal(EKODI_PUBLIC_REGISTRY_PATH,'/public-registry.json');
  for(const path of ['/admin','/api/test','/auth/start','/oauth/callback','/my','/preview/dev','/jadam/admin'])assert.equal(isPublicDiscoveryPath(path),false,path);
  for(const path of ['/','/jadam','/ekodimission','/seonammedi'])assert.equal(isPublicDiscoveryPath(path),true,path);
});

test('central registry includes public routes and excludes maintenance/private sites',async()=>{
  const rows=[
    {site_id:'jadam',public_status:'public',updated_at:'2026-10-02T00:00:00Z'},
    {site_id:'seonammedi',public_status:'maintenance',updated_at:'2026-10-02T00:00:00Z'},
  ];
  const env={DB:{
    prepare(sql){
      if(sql.includes('INSERT OR IGNORE INTO public_site_controls'))return{bind(){return this},run:async()=>({})};
      if(sql.includes('SELECT * FROM public_site_controls'))return{all:async()=>({results:rows})};
      if(sql.includes('customer_tenants'))return{all:async()=>({results:[]})};
      return{bind(){return this},all:async()=>({results:[]}),first:async()=>null,run:async()=>({})};
    },
    batch:async(statements)=>Promise.all(statements.map(s=>s.run?s.run():s)),
  }};
  const registry=await buildEkodiPublicRegistry(env);
  assert.equal(registry.canonicalHost,'ekodi.kr');
  assert.ok(registry.urls.includes('https://ekodi.kr/jadam'));
  assert.ok(!registry.urls.includes('https://ekodi.kr/seonammedi'));
  assert.equal(new Set(registry.urls).size,registry.urls.length);
});
