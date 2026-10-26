import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const block=(script,name)=>script.slice(script.indexOf(`const ${name}`),script.indexOf('\n);',script.indexOf(`const ${name}`)));

test('booth pages ship no inline script and are not indexed',()=>{
  for(const page of ['prototypes/cgmurrc-booth.html','prototypes/cgmurrc-booth-admin.html']){
    const html=read(page);
    assert.match(html,/<meta name="robots" content="noindex, nofollow">/);
    assert.match(html,/<meta name="referrer" content="no-referrer">/);
    assert.equal((html.match(/<script\b/g)||[]).length,1);
    assert.match(html,/<script type="module" src="\/cgmurrc\/booth\/(admin\/)?app\.js"><\/script>/);
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
  assert.match(html,/a\.button\[hidden\]\{display:none\}/,'the login button really hides after sign-in');
});

test('build ships the booth pages and convergent merges dispatch Site Core',()=>{
  const build=read('scripts/build.mjs');
  for(const [from,to] of [['cgmurrc-booth.html','cgmurrc/booth/index.html'],['cgmurrc-booth.js','cgmurrc/booth/app.js'],
    ['cgmurrc-booth-admin.html','cgmurrc/booth/admin/index.html'],['cgmurrc-booth-admin.js','cgmurrc/booth/admin/app.js']]){
    assert.ok(build.includes(`prototypes/${from}\`,\`\${output}${to}`),from);
  }
  assert.ok(block(read('scripts/converge-orchestrated-pr-merge.mjs'),'sharedSiteTouched').includes("file.startsWith('prototypes/cgmurrc-')"));
});
