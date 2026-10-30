import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeDomemaeItem } from './domemae.js';

test('Domemae item normalization returns only minimal catalog fields', () => {
  const item = normalizeDomemaeItem({ basis: { no: 12345, title: '테스트 상품', status: '판매중', section: '직접판매', market: 'supply' }, seller: { sellerId: 'vendor' } }, '12345');
  assert.equal(item.itemNo, '12345');
  assert.equal(item.title, '테스트 상품');
  assert.equal(item.status, '판매중');
  assert.equal(item.section, '직접판매');
  assert.equal(item.market, 'supply');
});

test('Domemae migration keeps order and PII execution locked in DB', async () => {
  const sql = await readFile(new URL('./migrations/0012_domemae_official_connector.sql', import.meta.url), 'utf8');
  assert.match(sql, /'domemae-official'/);
  assert.match(sql, /'supplier_api'/);
  assert.match(sql, /'api_order'/);
  assert.match(sql, /DOMEMAE_EXECUTION_LOCKED/);
  assert.match(sql, /auto_order_enabled,customer_pii_allowed/);
  assert.match(sql, /supplier_connector_checks/);
});

test('connector source implements lookup and dry-run but not setOrder execution', async () => {
  const source = await readFile(new URL('./domemae.js', import.meta.url), 'utf8');
  assert.match(source, /mode: 'getItemView'/);
  assert.match(source, /order-dry-run/);
  assert.match(source, /executionAllowed: false/);
  assert.doesNotMatch(source, /mode:\s*'setOrder'/);
  assert.doesNotMatch(source, /DOMEMAE_ORDER_ENABLED/);
  assert.doesNotMatch(source, /recipientName|shippingAddress|buyerPhone/i);
});

test('credentials are referenced only as environment secrets and never returned', async () => {
  const source = await readFile(new URL('./domemae.js', import.meta.url), 'utf8');
  assert.match(source, /env\.DOMEMAE_API_KEY/);
  assert.match(source, /env\.DOMEMAE_USER_ID/);
  assert.match(source, /env\.DOMEMAE_SESSION_ID/);
  assert.match(source, /apiKeyConfigured/);
  assert.doesNotMatch(source, /apiKey:\s*env\.DOMEMAE_API_KEY/);
});


test('readiness exposes only safe allowlisted authentication diagnostic fields', async () => {
  const { handleDomemaeRequest } = await import('./domemae.js');
  const env = {
    MALL_OPERATIONS_TOKEN: 'SECRET_MALL_OPS', DOMEMAE_API_KEY: 'SECRET_API', DOMEMAE_USER_ID: 'user123',
    DOMEMAE_PASSWORD: 'SECRET_PASSWORD', DOMEGGOOK_READONLY_AUTH_PROBE_ENABLED: 'true', DOMEMAE_LOOKUP_ENABLED: 'false',
    DB: {
      prepare(sql) {
        let args = [];
        return {
          bind(...values) { args = values; return this; },
          async first() {
            if (sql.includes('FROM sourcing_providers')) return { provider_type: 'supplier_api', integration_mode: 'api', catalog_policy: 'reference_only', order_mode: 'api_order', auto_order_enabled: 0, customer_pii_allowed: 0 };
            if (sql.includes('FROM supplier_connector_checks')) return { result_status: 'failed', checked_at: '2026-10-29T03:00:00Z',
              metadata_json: JSON.stringify({ login: 'ok', asset: 'failed', errorCode: 'MEMBER_ERROR', rawResponse: 'SECRET_PASSWORD', extra: 'SECRET_API' }) };
            return null;
          },
          async run() { return {}; }
        };
      }
    }
  };
  const req = new Request('https://example.com/api/internal/connectors/domemae/readiness', { headers: { 'x-ekodi-mall-ops-token': 'SECRET_MALL_OPS' } });
  const result = await handleDomemaeRequest(req, env);
  assert.equal(result.status, 200);
  assert.equal(result.body.readiness.readOnlyAuthProbe.errorCode, 'MEMBER_ERROR');
  assert.equal(result.body.readiness.readOnlyAuthProbe.result, 'failed');
  assert.equal(result.body.readiness.gates.autoOrderEnabled, false);
  const responseText = JSON.stringify(result.body);
  for (const secret of ['SECRET_API','SECRET_PASSWORD','SECRET_MALL_OPS']) assert.ok(!responseText.includes(secret));
  assert.ok(!responseText.includes('rawResponse'));
});

test('manual auth check is protected and returns no raw supplier content', async () => {
  const { handleDomemaeRequest } = await import('./domemae.js');
  const env={DB:{},MALL_OPERATIONS_TOKEN:'OPS_SECRET'};
  let called=false;
  const url='https://example.com/api/internal/connectors/domemae/auth-probe';
  const noAuth=await handleDomemaeRequest(new Request(url,{method:'POST'}),env,{runAuthProbe:async()=>{called=true;return {ok:true};}});
  assert.equal(noAuth.status,401);assert.equal(called,false);
  const yesAuth=await handleDomemaeRequest(new Request(url,{method:'POST',headers:{'x-ekodi-mall-ops-token':'OPS_SECRET'}}),env,
    {runAuthProbe:async(_env,_fetch,opts)=>{assert.equal(opts.operatorRetry,true);return {ok:false,login:'failed',asset:'not-checked',errorCode:'PASSWORD_REJECTED',rawResponse:'SENSITIVE_TOKEN'};}});
  assert.equal(yesAuth.status,200);
  assert.equal(yesAuth.body.probe.errorCode,'PASSWORD_REJECTED');
  assert.equal(yesAuth.body.probe.ok,false);
  assert.ok(!JSON.stringify(yesAuth.body).includes('SENSITIVE_TOKEN'));
});

test('readiness strips any vendor raw response from safe login evidence', async () => {
  const { handleDomemaeRequest } = await import('./domemae.js');
  const secret='RAW_SUPPLIER_RESPONSE_SHOULD_NOT_LEAK';
  const env = {
    MALL_OPERATIONS_TOKEN:'OPS_TEST', DB: { prepare(sql) { return {
      bind(){return this;},
      async first(){return sql.includes('FROM supplier_connector_checks')
        ? { result_status:'failed',checked_at:'2026-10-29T11:00:00Z',
          metadata_json: JSON.stringify({ errorCode:'LOGIN_REJECTED',
            diagnostic: { httpStatus:200,jsonParsed:true,supplierResult:'false',clientIpMode:'loopback-fallback',raw:secret } }) }
        : null;},
      async run(){return {};}
    };}}
  };
  const request = new Request('https://example.com/api/internal/connectors/domemae/readiness',
    { headers: {'x-ekodi-mall-ops-token':'OPS_TEST'} });
  const r=await handleDomemaeRequest(request,env);
  assert.equal(r.status,200);
  assert.equal(r.body.readiness.readOnlyAuthProbe.diagnostic.supplierResult,'false');
  assert.equal(r.body.readiness.readOnlyAuthProbe.diagnostic.clientIpMode,'loopback-fallback');
  assert.ok(!JSON.stringify(r.body).includes(secret));
});
