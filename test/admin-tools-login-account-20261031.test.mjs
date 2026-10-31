import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {personAuthorityScript} from '../person-authority-page.js';
import {siteAdminBootstrapScript} from '../site-admin-bootstrap-page.js';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

// Reported 2026-10-31 (mobile): after login both admin tools landed on ekodi.kr/, and a
// stored Kakao session (a separate, unlinked Person) was shown only as "not an admin".

test('portal login returns to the two admin tools only, and can force a Google account choice',async()=>{
  const src=await read('auth-site/client-auth.js');
  assert.match(src,/const ADMIN_TOOL_CHOOSE_ACCOUNT=site==='portal'&&params\.get\('select_account'\)==='1';/);
  assert.match(src,/if\(ADMIN_TOOL_CHOOSE_ACCOUNT\)\{await renderGoogle\(\);return\}/);
  assert.match(src,/const adminToolReturn=config\.kind==='portal'&&target\.origin==='https:\/\/ekodi\.kr'\s*&&\['\/admin\/site-admins','\/admin\/site-admins\/','\/admin\/people','\/admin\/people\/'\]\.includes\(target\.pathname\);/);
  assert.match(src,/const internalEkodi=adminReturn\|\|adminToolReturn\|\|/);
  assert.match(await read('auth-site/auth-router.js'),/client-auth\.js\?v=20261031-admin-tools-account-1/);
});

for(const [name,factory] of [['person authority',personAuthorityScript],['site admin bootstrap',siteAdminBootstrapScript]]){
  test(`${name}: Google chooser link, central session first, clear wrong-account message`,async()=>{
    const js=await factory().text();
    assert.match(js,/auth\.searchParams\.set\('select_account','1'\)/);
    const central=js.indexOf("localStorage.getItem('sb-renzehysxirjilvdxacv-auth-token')");
    const tab=js.indexOf("sessionStorage.getItem(KEY)");
    assert.ok(central>0&&tab>central,'central session is read before the tab-stored token');
    assert.match(js,/show\(notAdminMessage\(\)\);try\{sessionStorage\.removeItem\(KEY\)\}catch\{\}return/);

    // Run the real helper against JWT-shaped tokens.
    const helper=js.slice(js.indexOf('const signedInAs='),js.indexOf("+' 위 버튼을 눌러")+"+' 위 버튼을 눌러 최고관리자 Google 계정을 선택해 다시 인증하세요.';};".length);
    const jwt=payload=>'h.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.s';
    const run=token=>new Function('token','atob',helper+'\nreturn notAdminMessage();')(token,s=>Buffer.from(s,'base64').toString('binary'));
    assert.match(run(jwt({email:'identity+kakao.3bedb7b84088a8cf@ekodi.kr'})),/현재 카카오 로그인으로 접속되어 있으며.*연결되어 있지 않습니다/);
    assert.match(run(jwt({email:'identity+naver.abc@ekodi.kr'})),/현재 네이버 로그인/);
    assert.match(run(jwt({email:'someone@example.test'})),/someone@example\.test 계정에는 최고관리자 권한이 없습니다/);
    assert.match(run('not-a-jwt'),/현재 로그인한 계정에는 최고관리자 권한이 없습니다/);
  });
}
