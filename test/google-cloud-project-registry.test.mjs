import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getGoogleCloudProjectInventory, isGeminiFreeTierConfirmed } from '../google-cloud-project-registry.js';

const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('missing credentials and projects remain unknown, not falsely connected or free',()=>{
  const result=getGoogleCloudProjectInventory({});
  assert.equal(result.contract,'ekodi.google-cloud-projects.v1');
  assert.equal(result.projectCount,0);
  assert.equal(result.verification,'configuration-only');
  assert.equal(result.geminiKeyPresent,false);
  assert.equal(result.paidAutoEscalation,false);
  assert.deepEqual(result.projects,[]);
});

test('configured project IDs are deduplicated, safely mapped and never mistaken for API status',()=>{
  const result=getGoogleCloudProjectInventory({
    GOOGLE_CLOUD_PROJECT_ID:'ekodi-platform',
    GEMINI_PROJECT_ID:'ekodi-platform',
    GEMINI_PROJECT_ID_2:'483044030492',
    GOOGLE_CLOUD_PROJECTS_JSON:JSON.stringify(['ekodi-platform',{projectId:'ekodi-church'}]),
    GEMINI_API_KEY:'private-secret-gemini-test',
    GOOGLE_AI_API_KEY:'different-private-secret',
    GOOGLE_SERVICE_ACCOUNT_JSON:'private-service-account-value',
  });
  assert.equal(result.projectCount,3);
  assert.equal(result.projects[0].id,'ekodi-platform');
  assert.deepEqual(result.projects[0].sources,['GOOGLE_CLOUD_PROJECT_ID','GEMINI_PROJECT_ID','GOOGLE_CLOUD_PROJECTS_JSON']);
  assert.equal(result.projects[0].billingTier,'unverified');
  assert.equal(result.projects[0].spendCap,'unverified');
  assert.equal(result.projects[0].quota,'unverified');
  assert.equal(result.projects[0].discovery,'configured-only');
  assert.equal(result.projects[0].services[0].status,'unverified');
  assert.match(result.projects[0].links.apiLibrary,/project=ekodi-platform/);
  assert.match(result.projects[1].links.billing,/483044030492/);
  assert.equal(result.geminiKeyPresent,true);
  assert.equal(JSON.stringify(result).includes('private-secret'),false);
  assert.equal(JSON.stringify(result).includes('private-service-account-value'),false);
});

test('untrusted project identifiers and invalid registry JSON cannot enter admin hyperlinks',()=>{
  const hostile='x\"><script>alert(1)</script>';
  const result=getGoogleCloudProjectInventory({
    GEMINI_PROJECT_ID:hostile,
    GOOGLE_CLOUD_PROJECTS_JSON:JSON.stringify([hostile,'https://example.com/?x=1','ekodi-valid']),
  });
  assert.equal(result.projectCount,1);
  assert.equal(result.projects[0].id,'ekodi-valid');
  assert.ok(result.projects[0].services.every(item=>item.settingsUrl.startsWith('https://console.cloud.google.com/apis/library/')));
  assert.equal(getGoogleCloudProjectInventory({GOOGLE_CLOUD_PROJECTS_JSON:'not-json'}).projectCount,0);
});

test('authenticated provider admin exposes Google project registry, but does not claim external authority',()=>{
  const server=source('ai-provider-control.js'),client=source('admin-provider-control.js');
  assert.match(server,/getGoogleCloudProjectInventory\(env\)/);
  assert.match(server,/const session=await adminSession\(request,env\)/);
  assert.match(client,/'google-cloud':\{label:'Google Cloud'/);
  assert.match(client,/googleCloudLinks\(p\)/);
  assert.match(client,/미검증/);
  assert.match(client,/결제 확인/);
  assert.doesNotMatch(client,/localStorage/);
});

test('Gemini free-tier attestation fails closed unless explicitly enabled',()=>{
  assert.equal(isGeminiFreeTierConfirmed({}),false);
  assert.equal(isGeminiFreeTierConfirmed({EKODI_GEMINI_FREE_TIER_ONLY_CONFIRMED:'false'}),false);
  assert.equal(isGeminiFreeTierConfirmed({EKODI_GEMINI_FREE_TIER_ONLY_CONFIRMED:'true'}),true);
  assert.equal(isGeminiFreeTierConfirmed({EKODI_GEMINI_FREE_TIER_ONLY_CONFIRMED:'on'}),true);
  assert.equal(getGoogleCloudProjectInventory({EKODI_GEMINI_FREE_TIER_ONLY_CONFIRMED:'true'}).geminiFreeTierAttested,true);
});

test('production gateway and scheduled checks block Gemini before any external API call when tier is unverified',()=>{
  const server=source('ai-provider-control.js');
  assert.match(server,/gemini-free-tier-unverified/);
  assert.match(server,/gemini_free_tier_unverified/);
  assert.match(server,/id==='gemini'&&clean\(env\.ENVIRONMENT,40\)\.toLowerCase\(\)==='production'&&!isGeminiFreeTierConfirmed\(env\)/);
  assert.match(server,/freeGuardBinding:'EKODI_GEMINI_FREE_TIER_ONLY_CONFIRMED'/);
});
