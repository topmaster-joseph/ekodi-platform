import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { routeCanonicalSurface } from '../canonical-surface-router.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

function binding(body='ok',type='text/plain'){
  const calls=[];
  return {calls,fetch:async request=>{calls.push(new URL(request.url));return new Response(body,{headers:{'content-type':type}})}};
}

test('public person pages are a public projection of My EKODI, not a second admin surface',async()=>{
  const [home,app,worker,profileApi,migration]=await Promise.all([
    read('my/index.html'),
    read('my/app.js'),
    read('my-worker.js'),
    read('supabase/functions/profile-api/index.ts'),
    read('supabase/migrations/20260923085000_person_public_profiles.sql'),
  ]);
  assert.match(home,/개인 관리공간 · 나만 보는 곳/);
  assert.match(home,/id="publicProfileForm"/);
  assert.match(home,/id="publicHandle"/);
  assert.match(home,/id="publicProfileVisibility"/);
  assert.match(home,/공개 개인페이지/);
  assert.match(app,/public_profile/);
  assert.match(app,/callProfileApi\('PATCH',payload,'\/public-profile'\)/);
  assert.match(worker,/PUBLIC_PERSON_PATH_RE/);
  assert.match(worker,/공개 개인페이지 · 다른 사람이 보는 곳/);
  assert.match(worker,/select.*handle,display_name,headline,bio,links,updated_at/);
  assert.doesNotMatch(worker,/select.*person_id.*handle,display_name/);
  assert.match(profileApi,/path==="\/public-profile"/);
  assert.match(profileApi,/public_handle_taken/);
  assert.match(migration,/visibility text not null default 'private'/);
  assert.match(migration,/using \(visibility = 'public'\)/);
  assert.match(migration,/grant select \(handle, display_name, headline, bio, links, visibility, updated_at\)/);
  assert.doesNotMatch(migration,/grant select \([^\n]*person_id/);
});

test('canonical apex preserves /@handle while handing the public page to My service ownership',async()=>{
  const my=binding('<html>person</html>','text/html');
  const response=await routeCanonicalSurface(new Request('https://ekodi.kr/@joseph'),{MY:my});
  assert.equal(response.status,200);
  assert.equal(my.calls.length,1);
  assert.equal(my.calls[0].pathname,'/@joseph');
  assert.equal(response.headers.get('x-ekodi-canonical-surface'),'person-public-profile');
  assert.equal(response.headers.get('x-ekodi-canonical-path'),'');
});

test('invalid @ paths are not claimed by the person profile router',async()=>{
  const my=binding();
  const response=await routeCanonicalSurface(new Request('https://ekodi.kr/@x'),{MY:my});
  assert.equal(response,null);
  assert.equal(my.calls.length,0);
});
