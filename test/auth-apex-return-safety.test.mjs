import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const legacy=read('auth-site/auth.js');
const client=read('auth-site/client-auth.js');
const workspace=read('auth-site/auth-workspace-target.js');
const server=read('supabase/functions/access-api/index.ts');
const canonical={
  biz:'/ekodibiz', books:'/books', lab:'/ekodilab',
  edu:'/edu', media:'/media', marketing:'/ekodibiz/marketing-ai',
  social:'/social', energy:'/energy'
};
const endOf=(source,start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+1);assert.ok(a>=0&&b>a);return source.slice(a,b)};

function loginTarget(site,url){
  const source=endOf(legacy,'const services=','const sb=createClient');
  const q=new URLSearchParams({site,return_to:url});
  return runInNewContext(source+'\nreturnTo',{URL,URLSearchParams,location:{search:'?'+q},ACCESS:'',PERSON_WORKSPACE:''});
}
function serverHandoff(site,url){
  let code=endOf(server,'function validHandoff(site:string,raw:string){','function tenantSlugBase(');
  code=code.replace('site:string,raw:string','site,raw')
    .replace('const origins:Record<string,string[]>','const origins')
    .replace('const canonicalPrefixes:Record<string,string[]>','const canonicalPrefixes');
  return runInNewContext(code+'\nvalidHandoff',{URL,validMarketingOrigin:()=>false})(site,url);
}
function clientTarget(site,url){
  const source=endOf(client,'const realms=','const params=');
  const realms=runInNewContext(source+'\nrealms',{URL});
  const config=realms[site];
  assert.ok(config,'missing realm '+site);
  const code=endOf(client,'function safeReturn(raw){','const RETURN_TO=');
  return runInNewContext(code+'\nsafeReturn',{URL,config,DIRECT_LOGIN:false})(url);
}
function workspaceTarget(site,url){
  const defaults=runInNewContext(endOf(workspace,'const serviceDefaults=','const serviceOrigins=')+'\nserviceDefaults',{URL});
  const originCode=endOf(workspace,'const serviceOrigins=','const origins=');
  const origins=runInNewContext(originCode+'\nserviceOrigins',{URL})[site]||[];
  const code=endOf(workspace,'function safeReturn(raw){','const returnTo=');
  return runInNewContext(code+'\nsafeReturn',{URL,site,origins,fallback:defaults[site]})(url);
}
test('canonical return routes are consistent across browser and server site handoffs',()=>{
  for(const [site,path] of Object.entries(canonical)){
    const url='https://ekodi.kr'+path+'/nested?from=auth';
    assert.equal(loginTarget(site,url),url,site+' login');
    assert.equal(serverHandoff(site,url),url,site+' server');
    if(site!=='marketing')assert.equal(clientTarget(site,url),url,site+' client');
    assert.equal(workspaceTarget(site,url),url,site+' workspace');
    const other='https://ekodi.kr/admin/control';
    for(const [label,fn] of [['login',loginTarget],...(site==='marketing'?[]:[['client',clientTarget]]),['workspace',workspaceTarget]]){
      assert.notEqual(fn(site,other),other,site+' '+label+' accepted cross-service admin');
    }
    assert.equal(serverHandoff(site,other),null,site+' backend accepted cross-service admin');
    assert.equal(serverHandoff(site,'https://evil.test'+path),null,site+' backend accepted unknown origin');
  }
});
test('unregistered realm fallback cannot invent a new EKODI subdomain',()=>{
  const code=endOf(client,'function implicitEkodiRealm(id){','const manifestConfig=');
  const normalized=code.replace('const manifestConfig=await manifestRealm(site);','');
  const fn=runInNewContext(normalized+'\nimplicitEkodiRealm',{URL});
  assert.equal(fn('unknown-plugin'),null);
  assert.equal(fn('admin'),null);
});
