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
  assert.doesNotMatch(js,/sessionStorage\.setItem/);
});

test('build ships the booth pages and convergent merges dispatch Site Core',()=>{
  const build=read('scripts/build.mjs');
  for(const [from,to] of [['cgmurrc-booth.html','cgmurrc/booth/index.html'],['cgmurrc-booth.js','cgmurrc/booth/app.js'],
    ['cgmurrc-booth-admin.html','cgmurrc/booth/admin/index.html'],['cgmurrc-booth-admin.js','cgmurrc/booth/admin/app.js']]){
    assert.ok(build.includes(`prototypes/${from}\`,\`\${output}${to}`),from);
  }
  assert.ok(block(read('scripts/converge-orchestrated-pr-merge.mjs'),'sharedSiteTouched').includes("file.startsWith('prototypes/cgmurrc-')"));
});
