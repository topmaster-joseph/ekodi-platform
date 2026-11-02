import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('church-local My Page is user-facing and separated from admin operations',async()=>{
  const [html,app,publicIndex,publicScript]=await Promise.all([
    read('my/index.html'),read('my/app.js'),read('index.html'),read('script.js')
  ]);
  assert.match(html,/EKODI CHURCH · MY PAGE/);
  assert.match(html,/noindex,nofollow,noarchive/);
  assert.match(html,/https:\/\/ekodi\.kr\/auth\/\?site=church/);
  assert.match(html,/data-ekodi-header-actions/);
  assert.match(html,/\.\/language\.js/);
  assert.doesNotMatch(html,/https:\/\/ekodi\.kr\/my\//);
  assert.doesNotMatch(html,/내 EKODI|MY EKODI|다른 EKODI 활동/);
  assert.doesNotMatch(html,/운영자 기능은 별도 관리자 화면에서 처리합니다/);
  assert.doesNotMatch(html,/church_worship_materials|current_site_access|tenant_admin/);
  assert.match(app,/sb-\.\*-auth-token/);
  assert.match(app,/clearAuthReturnFragment/);
  assert.match(app,/location\.hash\.startsWith\('#ekodi_'\)/);
  assert.match(publicIndex,/href="\/ekodichurch\/my\//);
  assert.match(publicScript,/href: '\/ekodichurch\/my\/'/);
  assert.doesNotMatch(publicIndex,/href="https:\/\/ekodi\.kr\/ekodichurch\/my/);
  assert.doesNotMatch(publicScript,/href: 'https:\/\/ekodi\.kr\/ekodichurch\/my/);
});

test('legacy worship console remains separate from the member home',async()=>{
  const [member,worship]=await Promise.all([read('my/index.html'),read('mypage/index.html')]);
  assert.match(worship,/예배 운영 콘솔/);
  assert.doesNotMatch(member,/PPT 다운로드|모두 준비하기|church_worship_materials/);
});
