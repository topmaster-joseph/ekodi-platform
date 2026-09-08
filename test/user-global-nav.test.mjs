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
