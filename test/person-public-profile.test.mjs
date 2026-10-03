import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { routeCanonicalSurface } from '../canonical-surface-router.js';
import myWorker from '../my-worker.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

function binding(body='ok',type='text/plain'){
  const calls=[];
  return {calls,fetch:async request=>{calls.push(new URL(request.url));return new Response(body,{headers:{'content-type':type}})}};
}

test('public person pages are a public projection of My EKODI, not a second admin surface',async()=>{
  const [home,control,worker,migration,userHeader,digitalCardServer,digitalCardAdmin,digitalCardClient,digitalCardQr,digitalCardMigration,identityShareMigration,qrVendor]=await Promise.all([
    read('my/index.html'),
    read('my/public-profile.js'),
    read('my-worker.js'),
    read('supabase/migrations/20260923085000_person_public_profiles.sql'),
    read('shell/user-ui-header.js'),
    read('my/person-digital-card.js'),
    read('my/digital-card-admin.js'),
    read('my/digital-card.js'),
    read('my/digital-card-qr.js'),
    read('supabase/migrations/20260930002300_person_digital_card_exchange.sql'),
    read('supabase/migrations/20261001034500_person_identity_share_contexts.sql'),
    read('my/vendor/qrcode.min.js'),
  ]);
  assert.match(home,/개인 관리공간 · 나만 보는 곳/);
  assert.match(home,/id="publicProfileForm"/);
  assert.match(home,/id="publicHandle"/);
  assert.match(home,/id="publicProfileVisibility"/);
  assert.match(home,/공개 개인페이지/);
  assert.match(control,/get_my_public_profile/);
  assert.match(control,/set_my_public_profile/);
  assert.match(control,/EKODI_MY_AUTH/);
  assert.match(worker,/PUBLIC_PERSON_PATH_RE/);
  assert.match(worker,/공개 개인페이지 · 다른 사람이 보는 곳/);
  assert.match(worker,/select.*handle,display_name,headline,bio,links,updated_at/);
  assert.doesNotMatch(worker,/select.*person_id.*handle,display_name/);
  assert.match(migration,/create or replace function public\.get_my_public_profile\(\)/);
  assert.match(migration,/create or replace function public\.set_my_public_profile/);
  assert.match(migration,/security definer/);
  assert.match(migration,/grant execute on function public\.set_my_public_profile/);
  assert.match(migration,/visibility text not null default 'private'/);
  assert.match(migration,/using \(visibility = 'public'\)/);
  assert.match(migration,/grant select \(handle, display_name, headline, bio, links, visibility, updated_at\)/);
  assert.doesNotMatch(migration,/grant select \([^\n]*person_id/);
  assert.match(userHeader,/운영공간/);
  assert.match(userHeader,/data-ekodi-operating-space-label/);
  assert.match(userHeader,/badge\.textContent='운영공간'/);
  assert.match(home,/id="digitalCardForm"/);
  assert.match(home,/id="contactExchangeInbox"/);
  assert.match(worker,/routePersonDigitalCard/);
  assert.match(worker,/digitalCardPath:'\/\{handle\}\/card'/);
  assert.match(digitalCardServer,/person_identity_share/);
  assert.match(digitalCardServer,/submit_person_contact_exchange_v2/);
  assert.match(digitalCardServer,/person-digital-card-qr-center/);
  assert.match(digitalCardServer,/\/my\/vendor\/qrcode\.min\.js/);
  assert.match(digitalCardServer,/CARD_EXCHANGE_RATE_LIMITER/);
  assert.match(digitalCardAdmin,/set_my_identity_share_config/);
  assert.match(digitalCardAdmin,/get_my_identity_share_config/);
  assert.match(digitalCardAdmin,/get_my_contact_exchanges/);
  assert.match(digitalCardClient,/navigator\.contacts/);
  assert.match(digitalCardClient,/contextKey/);
  assert.match(digitalCardQr,/new QRCode/);
  assert.match(digitalCardQr,/downloadQr/);
  assert.match(qrVendor,/QRCode/);
  assert.match(digitalCardMigration,/create table if not exists private\.person_digital_cards/);
  assert.match(digitalCardMigration,/create table if not exists private\.person_contact_exchanges/);
  assert.match(digitalCardMigration,/create table if not exists private\.person_contact_exchange_rate_limits/);
  assert.match(digitalCardMigration,/contact_exchange_rate_limited/);
  assert.match(digitalCardMigration,/request_count>8/);
  assert.match(digitalCardMigration,/grant execute on function public\.submit_person_contact_exchange/);
  assert.match(digitalCardMigration,/p_privacy_consent boolean default false/);
  assert.doesNotMatch(digitalCardMigration,/grant select[^;]*private\.person_contact_exchanges/i);
  assert.match(identityShareMigration,/create table if not exists private\.person_identity_roles/);
  assert.match(identityShareMigration,/create table if not exists private\.person_share_contexts/);
  assert.match(identityShareMigration,/person_share_contexts_one_default_idx/);
  assert.match(identityShareMigration,/create or replace function public\.person_identity_share/);
  assert.match(identityShareMigration,/create or replace function public\.set_my_identity_share_config/);
  assert.match(identityShareMigration,/create or replace function public\.submit_person_contact_exchange_v2/);
  assert.match(identityShareMigration,/context_label/);
  assert.match(home,/id="digitalCardRoles"/);
  assert.match(home,/id="digitalCardContexts"/);
  assert.match(home,/id="digitalCardQrLink"/);
});

test('canonical apex preserves /@handle while handing the public page to My service ownership',async()=>{
  const my=binding('<html>person</html>','text/html');
  const response=await routeCanonicalSurface(new Request('https://ekodi.kr/@joseph'),{MY:my});
  assert.equal(response.status,200);
  assert.equal(my.calls.length,1);
  assert.equal(my.calls[0].pathname,'/@joseph');
  assert.equal(response.headers.get('x-ekodi-canonical-surface'),'person-public-profile');
  assert.equal(response.headers.get('x-ekodi-canonical-path'),'/');
});

test('shared-site guarded release verifies public person route ownership before promotion',async()=>{
  const manifest=JSON.parse(await read('deploy/manifests/shared-site.worker.json'));
  const probe=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/@ekodi-public-probe');
  assert.deepEqual(probe?.statuses,[404]);
  assert.equal(probe?.redirect,'manual');
  assert.ok(probe?.expect?.includes('공개 개인페이지를 찾을 수 없습니다.'));
  assert.ok(probe?.headerExpect?.includes('x-ekodi-canonical-surface: person-public-profile'));
  assert.ok(probe?.headerExpect?.includes('x-ekodi-canonical-path: /'));
  assert.ok(probe?.headerExpect?.includes('x-ekodi-surface-context: public-person-profile'));
  assert.ok(probe?.headerExpect?.includes('x-robots-tag: noindex, nofollow, noarchive'));
});

test('shared-site digital-card release probe stays aligned with the My service contract',async()=>{
  const [sharedManifest,myManifest]=await Promise.all([
    read('deploy/manifests/shared-site.worker.json').then(JSON.parse),
    read('deploy/manifests/my.worker.json').then(JSON.parse),
  ]);
  const sharedProbe=sharedManifest.worker.requests.find(item=>item.url==='https://ekodi.kr/ekodi-card-probe/card');
  const myProbe=myManifest.worker.requests.find(item=>item.url==='https://ekodi-my.topmaster-joseph.workers.dev/ekodi-card-probe/card');
  assert.deepEqual(sharedProbe?.statuses,[404]);
  assert.deepEqual(myProbe?.statuses,[404]);
  assert.deepEqual(sharedProbe?.expect,myProbe?.expect);
  assert.ok(sharedProbe?.expect?.includes('공개된 개인 프로필을 찾을 수 없습니다.'));
  assert.ok(sharedProbe?.headerExpect?.includes('x-ekodi-canonical-surface: person-digital-card'));
  assert.ok(sharedProbe?.headerExpect?.includes('x-ekodi-surface-context: person-digital-card'));
});

test('invalid @ paths are not claimed by the person profile router',async()=>{
  const my=binding();
  const response=await routeCanonicalSurface(new Request('https://ekodi.kr/@x'),{MY:my});
  assert.equal(response,null);
  assert.equal(my.calls.length,0);
});


test('canonical apex hands person digital-card paths to My EKODI',async()=>{
  for(const path of ['/joseph/card','/joseph/card.vcf','/joseph/card/exchange','/joseph/qr']){
    const my=binding('<html>card</html>','text/html');
    const method=path.endsWith('/exchange')?'POST':'GET';
    const response=await routeCanonicalSurface(new Request('https://ekodi.kr'+path,{method}),{MY:my});
    assert.ok(response);
    assert.equal(my.calls.length,1);
    assert.equal(my.calls[0].pathname,path);
    assert.equal(response.headers.get('x-ekodi-canonical-surface'),'person-digital-card');
  }
});

test('person QR route renders a first-party QR share center for the selected context',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    if(String(url).includes('/rest/v1/rpc/person_identity_share')){
      return new Response(JSON.stringify({
        ok:true,ready:true,handle:'joseph',display_name:'Joseph Jeong',headline:'',bio:'',links:[],phone:'',email:'',
        exchange_enabled:true,
        contexts:[{key:'ekodi',label:'EKODI',is_default:true,role_name:'EKODI',role_title:'대표'}],
        selected_context:{key:'ekodi',label:'EKODI',is_default:true},
        role:{key:'ekodi',name:'EKODI',title:'대표',description:'',url:''},
      }),{status:200,headers:{'content-type':'application/json'}});
    }
    return originalFetch(url);
  };
  try{
    const response=await myWorker.fetch(new Request('https://ekodi.kr/joseph/qr?context=ekodi'),{
      DATA_ENABLED:'true',DATA_MODE:'isolated-staging',
      SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'publishable-test',
    });
    assert.equal(response.status,200);
    assert.equal(response.headers.get('x-ekodi-surface-context'),'person-digital-card-qr-center');
    const body=await response.text();
    assert.match(body,/QR 공유센터/);
    assert.match(body,/id="qrCode"/);
    assert.match(body,/context=ekodi&amp;utm_source=qr/);
    assert.match(body,/\/my\/vendor\/qrcode\.min\.js/);
    assert.doesNotMatch(body,/http-equiv="refresh"|location\.replace/);
  }finally{globalThis.fetch=originalFetch}
});
