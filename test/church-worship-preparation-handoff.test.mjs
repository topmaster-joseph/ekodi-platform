import test from 'node:test';
import assert from 'node:assert/strict';
import {churchPastorAdminScript} from '../church-pastor-admin-page.js';

test('authorized Church worship admin receives protected original Google document editor handoff',()=>{
  assert.match(churchPastorAdminScript,/const aiWorshipPanel=canWrite\(\)\?/);
  assert.match(churchPastorAdminScript,/href="\/ekodichurch\/mypage\/" class="button" target="_blank" rel="noopener noreferrer"/);
  assert.match(churchPastorAdminScript,/예배준비실 · 설교·주보·PPT Google 원본 편집/);
  assert.match(churchPastorAdminScript,/별도로 교회 운영관리자 권한을 검증합니다/);
  assert.match(churchPastorAdminScript,/웹 공개는 변경되지 않습니다/);
  assert.doesNotMatch(churchPastorAdminScript,/https:\/\/docs\.google\.com\/document\/d\/1OMawt|https:\/\/docs\.google\.com\/presentation\/d\/1EMoG2/);
  assert.match(churchPastorAdminScript,/if\(!canSection\(section\)\)/);
  // A handoff is navigation, not an API expansion: all edit mutations still
  // require the destination's tenant-admin authorization and RLS checks.
  assert.match(churchPastorAdminScript,/function loginPanel\(/);
  assert.match(churchPastorAdminScript,/function deniedPanel\(/);
  assert.doesNotMatch(churchPastorAdminScript,/church_worship_sources.*service_role/);
});
