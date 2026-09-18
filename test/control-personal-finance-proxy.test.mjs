import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../mission-control-entry-worker.js';

const request = (init={}) => new Request('https://api.ekodi.kr/api/control/personal-finance', {
  method:init.method || 'GET',
  headers:{origin:'https://ekodi.kr', ...(init.headers||{})},
  ...(init.body ? {body:init.body} : {}),
});

test('Control API fails closed when Personal Finance binding is unavailable', async () => {
  const response=await worker.fetch(request(), {});
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,'PERSONAL_FINANCE_BINDING_UNAVAILABLE');
  assert.equal(response.headers.get('cache-control'),'no-store');
});

test('Control API proxies Personal Finance admin auth contract through the service binding', async () => {
  let captured=null;
  const env={
    PERSONAL_FINANCE:{
      async fetch(req){
        captured=req;
        return new Response(JSON.stringify({error:'EKODI 관리자 인증이 필요합니다.',code:'PF_ADMIN_AUTH_REQUIRED'}),{
          status:401,
          headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
        });
      }
    }
  };
  const response=await worker.fetch(request(), env);
  assert.equal(response.status,401);
  assert.equal((await response.clone().json()).code,'PF_ADMIN_AUTH_REQUIRED');
  assert.equal(response.headers.get('x-ekodi-personal-finance-proxy'),'service-binding-v1');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.ok(captured);
  assert.equal(new URL(captured.url).pathname,'/api/admin/personal-finance/control');
  assert.equal(captured.headers.get('origin'),'https://ekodi.kr');
  assert.equal(captured.headers.get('x-ekodi-admin-proxy'),'personal-finance-binding-v1');
});
