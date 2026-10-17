import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('native browser QA uses real canonical markup but isolated fake identities and no production mutations',async()=>{
  const s=await read('scripts/verify-cheonggyepass-native-ui.mjs');
  assert.match(s,/const ORIGIN='https:\/\/ekodi\.kr'/);
  assert.match(s,/const ADMIN=ORIGIN\+'\/cheonggyepass\/admin'/);
  assert.match(s,/import \{ chromium \} from 'playwright'/);
  assert.match(s,/browser\.newContext/);
  assert.match(s,/serviceWorkers:'block'/);
  assert.match(s,/context\.route\('\*\*\/\*'/);
  assert.match(s,/syntheticToken='EKODI_LOCAL_ONLY_SYNTHETIC_NOT_A_REAL_TOKEN'/);
  assert.match(s,/roleInfo=\{/);
  assert.match(s,/vendor:\{/);
  assert.match(s,/admin:\{/);
  assert.match(s,/origin===ORIGIN&&url\.pathname===AUTH/);
  assert.match(s,/origin===ORIGIN&&url\.pathname\.startsWith\(API\)/);
  assert.match(s,/fixtureReply\(route/);
  assert.match(s,/!\['GET','HEAD','OPTIONS'\]\.includes\(method\)/);
  assert.match(s,/route\.abort\('blockedbyclient'\)/);
  assert.match(s,/realGoogleLogin:false/);
  assert.match(s,/productionWrites:0/);
  assert.match(s,/liveD1R2Persistence:false/);
  assert.doesNotMatch(s,/E2E_ADMIN_TOKEN|process\.env\.|storageState|connectOverCDP/);
});

test('browser verification exercises both responsive form modes and separates logged out, vendor and admin',async()=>{
  const s=await read('scripts/verify-cheonggyepass-native-ui.mjs');
  assert.match(s,/width:1440,height:900/);
  assert.match(s,/width:390,height:844/);
  assert.match(s,/guestJourney\(browser,profile,state\)/);
  assert.match(s,/visitWithAuth\(browser,profile,state,'vendor'\)/);
  assert.match(s,/visitWithAuth\(browser,profile,state,'admin'\)/);
  assert.match(s,/selectOption\('external_api'\)/);
  assert.match(s,/selectOption\('zip'\)/);
  assert.match(s,/selectOption\('rejected'\)/);
  assert.match(s,/setInputFiles/);
  assert.match(s,/artifactSha256=crypto\.createHash\('sha256'\)/);
  assert.match(s,/ZIP scanning bypass must remain unavailable/);
  assert.match(s,/OTHER_SYNTHETIC_VENDOR/);
  assert.match(s,/overflow<=2/);
  assert.match(s,/page\.screenshot/);
  assert.match(s,/await page\.waitForURL/);
  assert.match(s,/report\.passed=report\.profiles\.every/);
  assert.doesNotMatch(s,/Google OAuth success|realAuthVerified:true|productionWrites:1/);
});


test('official EKODI background browser registry is canonical, read-only and bound to pass routes',async()=>{
  const registry=JSON.parse(await read('config/cheonggyepass-browser-surface-registry.json'));
  assert.equal(registry.canonicalOrigin,'https://ekodi.kr');
  assert.ok(registry.maxPaths<=12);
  assert.deepEqual(registry.surfaces.filter(s=>s.enabled!==false).map(s=>s.path),[
    '/cheonggyepass','/cheonggyepass/admin'
  ]);
  assert.equal(registry.status,'read-only');
  assert.ok(!JSON.stringify(registry).includes('bearer'));
  const workflow=await read('.github/workflows/ekodi-background-browser-worker.yml');
  assert.match(workflow,/surface_registry:/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/allowMutation:false/);
});

test('Chromium script is syntax-valid and does not require credentials to be parsed',async()=>{
  const {execFileSync}=await import('node:child_process');
  const {fileURLToPath}=await import('node:url');
  const target=fileURLToPath(new URL('../scripts/verify-cheonggyepass-native-ui.mjs',import.meta.url));
  execFileSync(process.execPath,['--check',target],{timeout:20000,stdio:'pipe'});
});
