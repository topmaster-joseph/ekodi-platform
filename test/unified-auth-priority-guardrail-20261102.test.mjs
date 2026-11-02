import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {sitePublicationAdminAsset} from '../site-publication-runtime.js';
import {cheonggyePassVendorIntakeScript} from '../cheonggyepass-vendor-intake-ui.js';

const DEVOTION=readFileSync(new URL('../bible/devotion.js',import.meta.url),'utf8');
const PRIMARY='sb-renzehysxirjilvdxacv-auth-token';
const now=Math.floor(Date.now()/1000);
const central=(token,expiry=now+3600)=>JSON.stringify({currentSession:{access_token:token,refresh_token:'refresh',expires_at:expiry,user:{id:'u1',email:'current@example.test'}}});
function store(values={}){
  const rows=new Map(Object.entries(values));
  return {getItem:k=>rows.get(k)||null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k),key:i=>[...rows.keys()][i]||null,get length(){return rows.size},rows};
}
function segment(content,start,end){
  const a=content.indexOf(start),b=content.indexOf(end,a);
  assert.ok(a>=0&&b>a,'missing segment '+start);
  return content.slice(a,b);
}
function runToken(code,values={},session={},vars={}){
  const localStorage=store(values),sessionStorage=store(session);
  const t=runInNewContext('(function(){'+code+'return token()})()',{
    localStorage,sessionStorage,document:{documentElement:{dataset:{...vars}}},Date,Math,JSON
  });
  return {token:t,localStorage,sessionStorage};
}
const publication=await (await sitePublicationAdminAsset(new Request('https://ekodi.kr/site-publication-admin.js'))).text();
const vendor=await (await cheonggyePassVendorIntakeScript()).text();
const pubToken=segment(publication,'function token(){','function n(');
const vendorToken=segment(vendor,'const token=()=>{','function renderFields(){');

test('site publication uses current verified EKODI token before old administrator',()=>{
  const old={'ekodi-auth-token':'OLD_ADMIN_TOKEN'};
  assert.equal(runToken(pubToken,{[PRIMARY]:central('NEW_GOOGLE')},old).token,'NEW_GOOGLE');
  assert.equal(runToken(pubToken,{[PRIMARY]:central('EXPIRED',1)},old).token,'');
  assert.equal(runToken(pubToken,{},old).token,'OLD_ADMIN_TOKEN');
});
test('site publication keeps cooperative realm explicit and isolated',()=>{
  const result=runToken(pubToken,{[PRIMARY]:central('NEW_GOOGLE')},{
    'ekodi-auth-token':'OLD_ADMIN_TOKEN',
    'ekodi-cooperative-auth.v1':JSON.stringify({accessToken:'COOP_MEMBER'}),
  },{coopSlug:'tenant-shop',coopPlatform:'false'});
  assert.equal(result.token,'COOP_MEMBER');
});
test('CheonggyePass vendor intake reads current EKODI identity first',()=>{
  const fallback={'ekodi-auth-token':'OLD_PLATFORM','ekodi-region-admin-session':JSON.stringify({accessToken:'OLD_REGION',expiresAt:now+3600})};
  assert.equal(runToken(vendorToken,{[PRIMARY]:central('NEW_GOOGLE')},fallback).token,'NEW_GOOGLE');
  assert.equal(runToken(vendorToken,{[PRIMARY]:central('EXPIRED',1)},fallback).token,'');
  assert.equal(runToken(vendorToken,{},fallback).token,'OLD_PLATFORM');
});
test('devotion member session does not pick a different old user when current identity exists',()=>{
  const source=segment(DEVOTION,'function memberSessionEntry() {','let refreshing = null;');
  const run=(primary,other)=>{
    const localStorage=store({...primary?{[PRIMARY]:primary}:{},...other?{'sb-legacy-auth-token':other}:{}});
    return runInNewContext('(function(){'+source+'return memberSessionEntry();})()',{localStorage,CENTRAL_AUTH_KEY:PRIMARY,Date,Math,JSON});
  };
  assert.equal(run(central('CURRENT'),central('OLD')).session.access_token,'CURRENT');
  assert.equal(run(JSON.stringify({broken:true}),central('OLD')),null);
  assert.equal(run(null,central('OLD')).session.access_token,'OLD');
});
test('devotion admin requests never select an old privileged token over a central login',async()=>{
  const code=segment(DEVOTION,'function adminConsoleToken()','async function memberRest(');
  const run=(primary,memberToken)=>{
    const localStorage=store(primary?{[PRIMARY]:primary}:{});
    const sessionStorage=store({'ekodi-auth-token':'OLD_ADMIN'});
    return runInNewContext('(async()=>{'+code+'return await requestToken()})()',{
      localStorage,sessionStorage,ADMIN_TOKEN_KEY:'ekodi-auth-token',CENTRAL_AUTH_KEY:PRIMARY,
      memberSession:async()=>memberToken?{access_token:memberToken}:null,Date,Math,JSON
    });
  };
  assert.equal(await run(central('NEW_GOOGLE'),'NEW_GOOGLE'),'NEW_GOOGLE');
  assert.equal(await run(central('EXPIRED',1),null),'','expired current account must not become previous admin');
  assert.equal(await run(null,null),'OLD_ADMIN','old console fallback remains on independent host');
});
test('server-side permission checks remain in place',()=>{
  assert.match(publication,/site-publication/);
  assert.match(vendor,/vendor-intake/);
  assert.match(DEVOTION,/renderAdminBar/);
});
