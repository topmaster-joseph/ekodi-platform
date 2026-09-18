import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import missionControl from '../mission-control-entry-worker.js';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('canonical apex Control path is owned by CONTROL_API and proxies Personal Finance through its service binding',()=>{
  const canonical=read('canonical-surface-router.js');
  const mission=read('mission-control-entry-worker.js');
  const wrangler=read('wrangler.api.toml');
  assert.match(canonical,/path\.startsWith\('\/api\/'\)/);
  assert.match(canonical,/proxyBinding\(request,env\?\.CONTROL_API/);
  assert.match(mission,/PERSONAL_FINANCE_CONTROL_PATH = '\/api\/control\/personal-finance'/);
  assert.match(mission,/env\.PERSONAL_FINANCE\?\.fetch/);
  assert.match(mission,/target\.pathname = '\/api\/admin\/personal-finance\/control'/);
  assert.match(mission,/upstream\.status === 401/);
  assert.match(mission,/code:'PF_ADMIN_AUTH_REQUIRED'/);
  assert.match(mission,/X-EKODI-Personal-Finance-Proxy/);
  assert.match(wrangler,/\[\[services\]\]\s+binding = "PERSONAL_FINANCE"\s+service = "ekodi-personal-finance-api"/);
});

test('Control staging binds only to the isolated Personal Finance staging worker while local baseline stays isolated',()=>{
  const workflow=read('.github/workflows/deploy-control-api.yml');
  assert.match(workflow,/binding = "PERSONAL_FINANCE"\s+service = "ekodi-personal-finance-api-staging"/);
  assert.match(workflow,/Verify Personal Finance Control service binding in staging/);
  assert.match(workflow,/pf-control-staging\.json/);
  assert.match(workflow,/Cloudflare-Access/);
  assert.match(workflow,/PF_ADMIN_AUTH_REQUIRED/);
  assert.match(workflow,/wrangler\.api\.staging\.local-runtime\.toml/);
});

test('Control guarded release probes the Personal Finance canonical auth boundary',()=>{
  const manifest=JSON.parse(read('deploy/manifests/control-api.worker.json'));
  const probe=manifest.worker.requests.find(item=>item.url==='https://ekodi-auth-api.topmaster-joseph.workers.dev/api/control/personal-finance');
  assert.ok(probe);
  assert.deepEqual(probe.statuses,[401]);
  assert.ok(probe.expect.includes('PF_ADMIN_AUTH_REQUIRED'));
  assert.ok(probe.headerExpect.includes('x-ekodi-personal-finance-proxy: service-binding-v1'));
  assert.ok(probe.headerExpect.includes('cache-control: no-store'));
  assert.ok(probe.headerExpect.includes('x-content-type-options: nosniff'));
});

test('mission entry normalizes downstream unauthenticated Personal Finance responses before generic Control auth fallback',async()=>{
  let upstreamPath='';
  const env={
    PERSONAL_FINANCE:{
      async fetch(request){
        upstreamPath=new URL(request.url).pathname;
        return new Response(JSON.stringify({authenticated:false}),{
          status:401,
          headers:{'content-type':'application/json; charset=utf-8'}
        });
      }
    }
  };
  const response=await missionControl.fetch(new Request('https://api.example/api/control/personal-finance'),env,{});
  assert.equal(upstreamPath,'/api/admin/personal-finance/control');
  assert.equal(response.status,401);
  assert.equal(response.headers.get('x-ekodi-personal-finance-proxy'),'service-binding-v1');
  const data=await response.json();
  assert.equal(data.code,'PF_ADMIN_AUTH_REQUIRED');
  assert.equal(data.authenticated,undefined);
});
