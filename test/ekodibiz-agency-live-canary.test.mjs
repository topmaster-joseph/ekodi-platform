import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAgencyLive } from '../scripts/verify-ekodibiz-ai-agency-live.mjs';

const routes = ['apply','university','individual','manage'];
const navigation = routes.map(s => `<a href="/ekodibiz/ai-agency/${s}">${s}</a>`).join('');
const goodPage = (route) => `<html><head><title>AI 위탁 계약</title></head><body>${navigation}${route==='manage' ? '<input id="findId"><button id="findBtn">찾기</button>':''}</body></html>`;
const fakeHttp = ({ anonymousAdminStatus = 403, healthLive = false } = {}) => {
  const calls = [];
  const response = (status, obj, type='application/json') => new Response(typeof obj==='string'?obj:JSON.stringify(obj),
    {status, headers:{'content-type':type}});
  async function fetchImpl(url, init={}) {
    const path=new URL(url).pathname;
    calls.push({path,method:init.method||'GET',body:init.body||null,headers:init.headers||{}});
    if(path==='/ekodibiz/api/agency/health') return response(200,{ok:true,service:'ai-purchase-agency',maxMonths:120,realPaymentsEnabled:healthLive});
    if(path.startsWith('/ekodibiz/ai-agency/')){
      const route=path.split('/').pop();
      if(routes.includes(route)) return response(200,goodPage(route),'text/html; charset=utf-8');
    }
    if(path==='/ekodibiz/ai-agency-links.js') return response(200,
      routes.map(s=>`export const ${s} = ROOT+'/${s}'`).join(';'),'application/javascript');
    if(path.startsWith('/ekodibiz/api/agency/admin/'))return response(anonymousAdminStatus,
      anonymousAdminStatus===403?{ok:false,error:'admin_access_denied'}:{ok:true,items:[]});
    if(path==='/ekodibiz/api/agency/status')return response(404,{ok:false,error:'not_found'});
    throw Error('unexpected route '+path);
  }
  return {fetchImpl,calls};
};

test('canonical smoke validates public routes, protected admin endpoints, and fake customer receipt',async()=>{
  const {fetchImpl,calls}=fakeHttp();
  const result=await verifyAgencyLive({fetchImpl});
  assert.equal(result.ok,true);
  assert.deepEqual(result.pages,routes);
  assert.equal(result.anonymousAdminDenied.length,4);
  assert.equal(result.realPaymentsEnabled,false);
  assert.equal(calls.length,11);
  assert.ok(calls.every(c=>c.method==='GET'||c.method==='POST'));
  assert.ok(calls.every(c=>!c.path.match(/\/apply$|\/quote$|\/accept$|\/checkout$|\/confirm$|\/activate$|\/record-cycle$|\/stop-renewal$/) || c.method==='GET'));
  assert.ok(calls.filter(c=>c.method==='POST').every(c=>!c.headers['x-ekodibiz-agency-admin']));
});

test('production canary refuses unexpected live payments or anonymous administrator disclosure',async()=>{
  await assert.rejects(()=>verifyAgencyLive({fetchImpl:fakeHttp({healthLive:true}).fetchImpl}),
    /Unexpected real-money readiness change/);
  await assert.rejects(()=>verifyAgencyLive({fetchImpl:fakeHttp({anonymousAdminStatus:200}).fetchImpl}),
    /Anonymous admin API/);
});

test('production canary does not accept an unrelated origin',async()=>{
  const {fetchImpl,calls}=fakeHttp();
  await assert.rejects(()=>verifyAgencyLive({origin:'http://localhost:8787',fetchImpl}),/canonical HTTPS owner/);
  assert.equal(calls.length,0);
});
