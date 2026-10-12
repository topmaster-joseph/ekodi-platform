import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [client,legacy,workspace,api]=await Promise.all([
  read('auth-site/client-auth.js'),
  read('auth-site/auth.js'),
  read('auth-site/auth-workspace-target.js'),
  read('supabase/functions/access-api/index.ts')
]);

const churchHome='https://ekodi.kr/ekodichurch/';
const churchAdmin='https://ekodi.kr/ekodichurch/admin/worship';
const negative=[
 'https://'+['church','ekodi','kr'].join('.')+'/',
 'https://ekodi.kr/admin/',
 'https://ekodi.kr/ekodimission/admin',
 'https://evil.example/ekodichurch/',
 'http://ekodi.kr/ekodichurch/',
 'https://ekodi.kr@evil.example/ekodichurch/'
];

function extractBetween(text,start,end){
  const begin=text.indexOf(start),finish=text.indexOf(end,begin+start.length);
  assert.ok(begin>=0 && finish>begin,'Missing source function boundary '+start);
  return text.slice(begin,finish);
}

function routeFns(){
  const clientConfig={kind:'church',returnTo:churchHome,origins:['https://ekodi.kr']};
  const clientFn=runInNewContext(extractBetween(client,'function safeReturn(raw){','const RETURN_TO=')+'\nsafeReturn',
    {URL,config:clientConfig,DIRECT_LOGIN:false});
  const legacyConfig={returnTo:churchHome,origins:['https://ekodi.kr']};
  const legacyLine=legacy.split('\n').find(line=>line.startsWith('const safeReturn=raw=>'));
  assert.ok(legacyLine,'legacy safeReturn missing');
  const legacyFn=runInNewContext(legacyLine+'\nsafeReturn',{URL,site:'church',config:legacyConfig});
  const workspaceFn=runInNewContext(extractBetween(workspace,'function safeReturn(raw){','const returnTo=')+'\nsafeReturn',
    {URL,site:'church',origins:['https://ekodi.kr'],fallback:churchHome});
  let serverFn=extractBetween(api,'function validHandoff(site:string,raw:string){','function tenantSlugBase');
  serverFn=serverFn.replace('function validHandoff(site:string,raw:string){','function validHandoff(site,raw){')
    .replace('const origins:Record<string,string[]>={','const origins={');
  const backend=runInNewContext(serverFn+'\nvalidHandoff',{URL,validMarketingOrigin:()=>false});
  return {client:clientFn,legacy:legacyFn,workspace:workspaceFn,backend:raw=>backend('church',raw)};
}

test('every EKODI Church authentication and handoff realm uses the canonical apex Church mount',()=>{
  assert.match(client,/church:\{name:'EKODI Church',returnTo:'https:\/\/ekodi\.kr\/ekodichurch\/',origins:\['https:\/\/ekodi\.kr'\]/);
  assert.match(legacy,/church:\{name:'에코디교회'.*returnTo:'https:\/\/ekodi\.kr\/ekodichurch\/'.*origins:\['https:\/\/ekodi\.kr'\]/);
  assert.match(workspace,/church:'https:\/\/ekodi\.kr\/ekodichurch\/'/);
  assert.match(api,/church:\["https:\/\/ekodi\.kr"\]/);
  for(const source of [client,legacy,workspace,api]){
    assert.doesNotMatch(source,/church:\{[^\n]*returnTo:'https:\/\/church\.ekodi\.kr/);
    assert.doesNotMatch(source,/church:\[["']https:\/\/church\.ekodi\.kr/);
  }
});

test('all four independent Church handoff validators accept public and administrator destinations',()=>{
  const validators=routeFns();
  for(const [name,route] of Object.entries(validators)){
    assert.equal(route(churchHome),churchHome,name+' homepage');
    assert.equal(route(churchAdmin),churchAdmin,name+' admin worship');
    const specific='https://ekodi.kr/ekodichurch/admin/worship?ref=auth';
    assert.equal(route(specific),specific,name+' query preserved');
  }
});

test('Church handoff validators deny retired subdomain and cross-service redirects',()=>{
  for(const [name,route] of Object.entries(routeFns())){
    for(const unsafe of negative){
      const result=route(unsafe);
      assert.notEqual(result,unsafe,name+' admitted '+unsafe);
      if(name==='backend')assert.equal(result,null,name+' server must reject wrong-target request');
      else assert.equal(result,churchHome,name+' must fail closed to Church home');
    }
  }
});

test('other tenants continue to use their existing route contracts',()=>{
  assert.match(client,/mission:\{name:'EKODI Mission',returnTo:'https:\/\/ekodi\.kr\/ekodimission\/'/);
  assert.match(legacy,/site==='mission'/);
  assert.match(api,/site==="mission"/);
});
