import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const json=p=>JSON.parse(read(p));

test('broadcast and interpretation is one enforced common engine',()=>{
  const p=json('config/broadcast-interpretation-enforcement.json');
  assert.equal(p.status,'enforced');
  assert.equal(p.scope.allFutureSitesAutoInherit,true);
  assert.equal(p.scope.perSiteOptOutAllowed,false);
  assert.equal(p.scope.siteLocalForkOfCoreEngineAllowed,false);
  assert.equal(p.sharedRuntime.controlModule,'realtime-control.js');
  assert.equal(p.sharedRuntime.apiPrefix,'/api/realtime');
  assert.equal(p.canonicalAddressing.publicHub,'https://ekodi.kr/live');
  assert.equal(p.canonicalAddressing.siteAdminPattern,'https://ekodi.kr/{slug}/admin');
});

test('multilingual interpretation keeps source, captions and selectable audio',()=>{
  const p=json('config/broadcast-interpretation-enforcement.json');
  assert.equal(p.interpretationPipeline.sourceAudioAlwaysAvailable,true);
  assert.equal(p.interpretationPipeline.languageSelectionPerViewer,true);
  assert.equal(p.interpretationPipeline.humanInterpreterMayOverrideAiVoice,true);
  assert.ok(p.mandatoryCapabilities.includes('realtime-stt'));
  assert.ok(p.mandatoryCapabilities.includes('realtime-translation'));
  assert.ok(p.mandatoryCapabilities.includes('translated-captions'));
  assert.ok(p.mandatoryCapabilities.includes('language-audio-channel-selection'));
});

test('site presets customize presentation without forking the engine',()=>{
  const p=json('config/broadcast-interpretation-enforcement.json');
  assert.equal(p.sitePresets.ekodichurch.mode,'worship');
  assert.equal(p.sitePresets.ekodibiz.mode,'seminar');
  assert.equal(p.sitePresets.ekoditrade.mode,'trade-consultation');
  assert.equal(p.scope.siteSpecificCustomizationAllowed,true);
  assert.equal(p.scope.siteLocalForkOfCoreEngineAllowed,false);
});

test('runtime and central admin expose the shared contract',()=>{
  const realtime=read('realtime-control.js');
  const admin=read('admin-menu-registry.js');
  assert.match(realtime,/multitenant:true/);
  assert.match(realtime,/interpretationLanguageSelection:true/);
  assert.match(realtime,/externalDistributionFailIsolated:true/);
  assert.match(admin,/방송·채널·자동게시/);
});
