import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const audit=await readFile(new URL('../scripts/verify-seonammedi-nav-guest-native.mjs',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/verify-seonammedi-nav-guest-native.yml',import.meta.url),'utf8');

test('read-only live browser checks all three menu click vs reload views',()=>{
  for(const phrase of [
    "'활동이력':{hash:'#committee-activity',sectionId:'committee-activity',filterId:'committeeActivityFilters'}",
    "'관련소식':{hash:'#timeline',sectionId:'timeline',filterId:'timelineFilters'}",
    "'소통채널':{hash:'#channels',sectionId:'channels',filterId:'publicChannelTabs'}",
    'await page.reload({waitUntil:',
    'const clicked=await menuSnapshot(parity)',
    'const reloaded=await menuSnapshot(parity)',
    'native_click_reload_view_mismatch_',
    'record.menuClickReloadParity.push'
  ])assert.ok(audit.includes(phrase),'missing native parity contract: '+phrase);
});
test('native parity compares active panel, visible filter, menu, legacy overlay and hero',()=>{
  for(const signal of [
    'selectedVisible','filterVisible','activeNav','legacyPanelHidden','legacyTopic','heroHidden',
    'JSON.stringify(clicked)===JSON.stringify(reloaded)',
    'clicked.activeNav.length===1','reloaded.activeNav.length===1'
  ])assert.ok(audit.includes(signal),signal);
});
test('live proof runs on both domains desktop+mobile with all writes blocked',()=>{
  for(const value of ['https://ekodi.kr','https://seonammedi.kr',"name:'desktop'","name:'mobile'",'blockedbyclient'])
    assert.ok(audit.includes(value),value);
  assert.ok(workflow.includes('node scripts/verify-seonammedi-nav-guest-native.mjs'));
  assert.ok(workflow.includes("github.event_name != 'pull_request'"));
  assert.ok(workflow.includes('node --check scripts/verify-seonammedi-nav-guest-native.mjs'));
});
