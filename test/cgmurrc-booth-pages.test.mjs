import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const block=(script,name)=>script.slice(script.indexOf(`const ${name}`),script.indexOf('\n);',script.indexOf(`const ${name}`)));

test('booth pages ship no inline script and are not indexed',()=>{
  for(const page of ['prototypes/cgmurrc-booth.html','prototypes/cgmurrc-booth-admin.html','prototypes/cgmurrc-booth-board.html']){
    const html=read(page);
    assert.match(html,/<meta name="robots" content="noindex, nofollow">/);
    assert.match(html,/<meta name="referrer" content="no-referrer">/);
    assert.equal((html.match(/<script\b/g)||[]).length,1);
    assert.match(html,/<script type="module" src="\/cgmurrc\/booth\/((admin|board)\/)?app\.js"><\/script>/);
  }
});

test('the member page identifies itself only by the personal key, never by a member id',()=>{
  const js=read('prototypes/cgmurrc-booth.js');
  assert.match(js,/location\.hash/);
  assert.match(js,/'x-cgmurrc-booth-key':key/);
  assert.match(js,/credentials:'omit'/);
  assert.doesNotMatch(js,/member_id/);
  assert.doesNotMatch(js,/localStorage|innerHTML/);
});

test('the admin page never persists issued links and renders without innerHTML',()=>{
  const js=read('prototypes/cgmurrc-booth-admin.js');
  assert.doesNotMatch(js,/localStorage|innerHTML/);
  // The only thing written to storage is the tab-scoped admin session, never an issued member link.
  const writes=js.match(/sessionStorage\.setItem\([^)]*\)/g)||[];
  assert.deepEqual(writes,['sessionStorage.setItem(SESSION_KEY,JSON.stringify(v)']);
});

test('the admin page offers a real login button and never hangs on loading',()=>{
  const html=read('prototypes/cgmurrc-booth-admin.html');
  // A plain link, so login works even before (or without) the script.
  assert.match(html,/<a id="loginBtn" class="button" href="\/auth\/\?site=space&amp;direct=1&amp;return_to=https%3A%2F%2Fekodi\.kr%2Fcgmurrc%2Fbooth%2Fadmin%2F">/);
  assert.match(html,/id="retry"/);
  const js=read('prototypes/cgmurrc-booth-admin.js');
  assert.match(js,/ekodi_token/);
  assert.match(js,/history\.replaceState\(null,'',location\.pathname\+location\.search\)/,'one-use token removed from the address bar');
  assert.match(js,/\/auth\/v1\/verify/);
  assert.ok((js.match(/AbortSignal\.timeout\(TIMEOUT_MS\)/g)||[]).length>=2,'every request is bounded');
  assert.match(js,/credentials:bearer\?'omit':'same-origin'/,'a signed-in request does not also send the cookie');
  assert.match(html,/a\.button\[hidden\],\.row\[hidden\]\{display:none\}/,'the login button really hides after sign-in');
  // Switching accounts must force the central sign-in to drop a session for a different account.
  assert.match(js,/searchParams\.set\('expected_account',email\);u\.searchParams\.set\('force_account','1'\)/);
  assert.match(html,/id="switchForm"[^>]*hidden/);
});

test('build ships the booth pages and convergent merges dispatch Site Core',()=>{
  const build=read('scripts/build.mjs');
  for(const [from,to] of [['cgmurrc-booth.html','cgmurrc/booth/index.html'],['cgmurrc-booth.js','cgmurrc/booth/app.js'],
    ['cgmurrc-booth-admin.html','cgmurrc/booth/admin/index.html'],['cgmurrc-booth-admin.js','cgmurrc/booth/admin/app.js'],
    ['cgmurrc-booth-board.html','cgmurrc/booth/board/index.html'],['cgmurrc-booth-board.js','cgmurrc/booth/board/app.js']]){
    assert.ok(build.includes(`prototypes/${from}\`,\`\${output}${to}`),from);
  }
  assert.ok(block(read('scripts/converge-orchestrated-pr-merge.mjs'),'sharedSiteTouched').includes("file.startsWith('prototypes/cgmurrc-')"));
});

test('the public board page reads only the public endpoint and sends no credentials',()=>{
  const js=read('prototypes/cgmurrc-booth-board.js');
  assert.match(js,/const API='\/api\/cgmurrc\/booth\/board'/);
  assert.match(js,/credentials:'omit'/);
  assert.doesNotMatch(js,/x-cgmurrc-booth-key|authorization|sessionStorage|localStorage|innerHTML/);
});

test('Control API redeploys when only the booth API changes',()=>{
  const script=read('scripts/converge-orchestrated-pr-merge.mjs');
  assert.ok(block(script,'controlApiTouched').includes("'cgmurrc-booth-api.js'"));
});

test('the public board is laid out to fit one screen at any size',()=>{
  const html=read('prototypes/cgmurrc-booth-board.html');
  assert.match(html,/html\{font-size:clamp\([^)]*vh[^)]*\)/,'type scales with viewport height');
  assert.match(html,/#board\{flex:1 0 auto;display:grid;grid-template-rows:repeat\(8,/,'8 rows share the screen');
  assert.match(html,/@media \(min-width:760px\) and \(min-aspect-ratio:4\/3\)\{\s*#board\{grid-template-rows:repeat\(4,/,'wide screens use 2 x 4');
  assert.doesNotMatch(html,/#board\{[^}]*overflow:hidden/,'rows are never clipped on tiny screens');
  assert.match(read('prototypes/cgmurrc-booth-board.js'),/className:'slot'/);
});

test('the admin page offers select-all and bulk confirm/reject for pending requests',()=>{
  const html=read('prototypes/cgmurrc-booth-admin.html'),js=read('prototypes/cgmurrc-booth-admin.js');
  for(const id of ['selectAll','bulkConfirm','bulkReject','bulkBar'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(js,/action:'bulk',decision,items/);
  assert.match(js,/\$\('selectAll'\)\.indeterminate=/);
  assert.match(js,/\$\('bulkConfirm'\)\.disabled=!selected\.size/);
});

test('the admin page never shadows the label() helper, which once stopped rendering the link list',()=>{
  const js=read('prototypes/cgmurrc-booth-admin.js');
  assert.match(js,/const label=m=>/);
  assert.equal((js.match(/\bconst label\b/g)||[]).length,1,'only the helper may be named label');
});

test('the admin page fits a phone width and folds the long link list away',()=>{
  const html=read('prototypes/cgmurrc-booth-admin.html');
  assert.match(html,/#grid\{[^}]*table-layout:fixed/);
  assert.match(html,/@media \(max-width:640px\)/);
  assert.match(html,/<details id="linkPanel" class="panel">/);
});
