import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const workflow=read('../.github/workflows/deploy-space.yml');
const shell=read('../ekodi-shell-injector.js');
const chrome=read('../bbqcg-shared-chrome.js');
const portal=read('../bbqcg-order-portal.js');

test('Shell canonicalizes the original BBQ native header and marks the local footer',()=>{
  assert.match(chrome,/data-ekodi-user-header-root=\\?"bbqcg-v1\\?"/);
  assert.match(shell,/const USER_UI_VERSION='v1'/);
  assert.match(shell,/class UserHeaderAdopter/);
  assert.match(shell,/element\.setAttribute\('data-ekodi-user-header-root',USER_UI_VERSION\)/);
  assert.match(shell,/class UserFooterCanonicalizer/);
  assert.match(shell,/element\.setAttribute\('data-ekodi-service-footer','true'\)/);
  assert.match(shell,/on\('footer',footerState\)/);
  assert.match(portal,/renderBbqcgHeader\(\)/);
  assert.match(portal,/renderBbqcgFooter\(\)/);
});

test('protected Space production QR smoke validates Shell output and BBQ site identity, not raw HTML',()=>{
  const a=workflow.indexOf("      - name: Verify BBQ CG canonical host and retired-URL hard block");
  const b=workflow.indexOf("      - name:",a+15);
  assert.ok(a>=0,'protected smoke step must exist');
  const smoke=workflow.slice(a,b<0?undefined:b);
  assert.match(smoke,/qr_url='https:\/\/ekodi\.kr\/bbqcg\/order'/);
  assert.match(smoke,/check_qr 'canonical Shell header' 'data-ekodi-user-header-root="v1"'/);
  assert.match(smoke,/check_qr 'BBQ native header identity' 'aria-label="BBQ 무안청계점 홈"'/);
  assert.match(smoke,/check_qr 'BBQ site-owned footer'/);
  assert.match(smoke,/check_qr 'Shell adopted BBQ footer' 'data-ekodi-service-footer="true"'/);
  assert.match(smoke,/grep -Eiq '\^x-ekodi-shell:\[\[:space:\]\]\*v2'/);
  assert.match(smoke,/check_qr 'checkout button disabled'/);
  assert.match(smoke,/qr_failed=1/);
  assert.match(smoke,/Preserving checkout locked; no order or payment request was issued/);
  assert.doesNotMatch(smoke,/check_qr 'BBQ site-owned header' 'data-ekodi-user-header-root="bbqcg-v1"'/);
  assert.doesNotMatch(smoke,/curl [^\n]+-(?:X POST|X PUT|X PATCH)/);
});
