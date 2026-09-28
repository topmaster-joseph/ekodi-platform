import { readFile } from 'node:fs/promises';

const read = async path => readFile(new URL('../'+path, import.meta.url), 'utf8');
const json = async path => JSON.parse((await read(path)).replace(/^\uFEFF/,''));

const [policy,realtime,routeRegistry,adminMenu,workflow] = await Promise.all([
  json('config/broadcast-interpretation-enforcement.json'),
  read('realtime-control.js'),
  read('platform-route-registry.js'),
  read('admin-menu-registry.js'),
  read('.github/workflows/constitution-check.yml'),
]);

const failures=[];
const fail=m=>failures.push(m);

if(policy.schemaVersion!==1||policy.policyId!=='BROADCAST-INTERPRETATION-ENFORCEMENT-001'||policy.status!=='enforced') fail('broadcast/interpretation policy must remain enforced schema v1');
if(policy.canonicalHost!=='ekodi.kr') fail('canonical host must remain ekodi.kr');
if(policy.scope?.allFutureSitesAutoInherit!==true||policy.scope?.perSiteOptOutAllowed!==false) fail('future sites must inherit and per-site opt-out must remain forbidden');
if(policy.scope?.siteLocalForkOfCoreEngineAllowed!==false) fail('site-local fork of the common engine must remain forbidden');
if(policy.canonicalAddressing?.publicHub!=='https://ekodi.kr/live') fail('public live hub must remain https://ekodi.kr/live');
if(policy.canonicalAddressing?.siteAdminPattern!=='https://ekodi.kr/{slug}/admin') fail('site admin pattern must remain site-owned /admin');
if(policy.canonicalAddressing?.featureSubdomainCreationForbidden!==true) fail('feature subdomains must remain forbidden');
if(policy.sharedRuntime?.controlModule!=='realtime-control.js'||policy.sharedRuntime?.apiPrefix!=='/api/realtime') fail('shared runtime must remain realtime-control.js at /api/realtime');
if(policy.sharedRuntime?.multitenantRequired!==true||policy.sharedRuntime?.browserSecretsForbidden!==true) fail('multitenant and browser-secret restrictions must remain enabled');

const mandatory = new Set(policy.mandatoryCapabilities||[]);
for(const capability of [
  'camera-and-microphone','screen-and-document-sharing','presentation-layouts',
  'realtime-stt','realtime-translation','translated-captions','language-audio-channel-selection',
  'human-interpreter-channel','recording','multichannel-distribution','event-archive-linkage','ai-summary'
]) if(!mandatory.has(capability)) fail('missing mandatory capability: '+capability);

if(policy.interpretationPipeline?.languageSelectionPerViewer!==true) fail('viewer-selectable language channels are mandatory');
if(policy.interpretationPipeline?.sourceAudioAlwaysAvailable!==true) fail('source audio must remain selectable');
if(policy.distribution?.singleDestinationFailureMustNotStopCoreBroadcast!==true) fail('external destination failure isolation is mandatory');
if(policy.integration?.sharedBroadcastIdAcrossArchiveAndDistribution!==true) fail('broadcast/archive/distribution must share one broadcast id');
if(policy.verification?.canonicalProductionVerificationRequiredBeforeCompletionClaim!==true) fail('production verification must precede completion claims');

for(const tenant of ['ekodichurch','ekodimission','ekodibiz','ekoditrade','default']) {
  if(!policy.sitePresets?.[tenant]) fail('missing required site preset: '+tenant);
}

if(!routeRegistry.includes("id:'live',prefix:'/live'")) fail('platform route registry must retain canonical /live route');
for(const token of [
  "prefix:PREFIX",
  "multitenant:true",
  "browserSecrets:false",
  "externalDistributionFailIsolated:true",
  "interpretationLanguageSelection:true",
  "recordingManagement:true"
]) if(!realtime.includes(token)) fail('realtime runtime contract missing: '+token);

if(!adminMenu.includes("labels: { ko: '방송·채널·자동게시'")) fail('central admin must retain broadcast/channel operations entry');
if(!workflow.includes('Validate broadcast and interpretation enforcement')) fail('constitution workflow must run broadcast/interpretation enforcement');
if(!workflow.includes('node scripts/validate-broadcast-interpretation-enforcement.mjs')) fail('constitution workflow missing broadcast/interpretation validator command');

if(failures.length){
  console.error('Broadcast/interpretation enforcement failed ('+failures.length+')');
  failures.forEach(x=>console.error('- '+x));
  process.exit(1);
}
console.log('Broadcast/interpretation enforcement OK: shared multitenant engine + multilingual interpretation + site presets');
