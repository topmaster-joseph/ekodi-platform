import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('shared user navigation runtime removes legacy floating global and workspace selectors',async()=>{
  const nav=await read('shell/user-global-nav.js');
  assert.match(nav,/LEGACY_SELECTOR='\[data-ekodi-shell-root\],\[data-ekodi-user-global-nav\]'/);
  assert.match(nav,/dataset\.ekodiGlobalNav='off'/);
  assert.match(nav,/dataset\.ekodiWorkspaceSelector='hidden'/);
  assert.match(nav,/querySelectorAll\(LEGACY_SELECTOR\)/);
  assert.match(nav,/node\.remove\(\)/);
  assert.match(nav,/MutationObserver/);
  assert.match(nav,/removeLegacyFloatingChrome/);
  assert.doesNotMatch(nav,/attachShadow\(\{mode:'open'\}\)/);
  assert.doesNotMatch(nav,/data-ekodi-global-link="assistant"/);
  assert.doesNotMatch(nav,/EKODI 사용자 공통 메뉴/);
});

test('common chrome policy retires global audio and workspace selection',async()=>{
  const [policyText,ccmPlayer]=await Promise.all([
    read('config/user-ui-shell.json'),
    read('shell/ccm-mr-player.js')
  ]);
  const policy=JSON.parse(policyText);
  assert.equal(policy.version,11);
  assert.equal(policy.principles.persistentChromeHeaderFooterOnly,true);
  assert.equal(policy.principles.workspaceSelectionLivesInMyEkodi,true);
  assert.equal(policy.principles.globalAmbientAudioForbidden,true);
  assert.equal(policy.ambientAudio.globalControl,'retired');
  assert.equal(policy.ambientAudio.runtimeRole,'compatibility-tombstone');
  assert.equal(policy.ambientAudio.persistentChromeAllowed,false);
  assert.equal(policy.workspaceSelection.owner,'my-ekodi-content');
  assert.equal(policy.workspaceSelection.persistentGlobalControl,'forbidden');
  assert.match(ccmPlayer,/__EKODI_CCM_MR_RETIRED__/);
  assert.match(ccmPlayer,/dataset\.ekodiGlobalMr='off'/);
  assert.match(ccmPlayer,/ekodi-ccm-mr-toggle/);
});

test('Shell Worker keeps compatibility guards beside shared header/footer, Media/Meeting and language in one payload',async()=>{
  const worker=await read('ekodi-shell-worker.js');
  assert.match(worker,/user-global-nav\.js/);
  assert.match(worker,/user-ui-header\.js/);
  assert.match(worker,/user-ui-footer\.js/);
  assert.match(worker,/user-language\.js/);
  assert.match(worker,/media-meeting-adapter\.js/);
  assert.match(worker,/user-character\.js/);
  assert.match(worker,/ccm-mr-player\.js/);
  assert.match(worker,/admin-ui-shell\.js/);
  assert.match(worker,/globalNav/);
  assert.match(worker,/userLanguage/);
  assert.match(worker,/mediaMeeting/);
  assert.match(worker,/userCharacter/);
  assert.match(worker,/ccmMrPlayer/);
  assert.match(worker,/x-ekodi-user-language/);
  assert.match(worker,/x-ekodi-media-meeting/);
  assert.match(worker,/x-ekodi-user-character/);
  assert.match(worker,/x-ekodi-ccm-mr/);
  assert.match(worker,/x-ekodi-admin-ui-shell/);
  assert.match(worker,/\$\{shell\}\\n\$\{globalNav\}\\n\$\{userContext\}\\n\$\{userHeader\}\\n\$\{userFooter\}\\n\$\{userLanguage\}\\n\$\{mediaMeeting\}\\n\$\{userCharacter\}\\n\$\{ccmMrPlayer\}\\n\$\{adminShell\}\\n\$\{fixedHeader\}/);
});
